import { NextResponse } from "next/server";
import { createAdminSupabase } from "@/lib/supabase-admin";
import { getAuthenticatedUserOrThrow } from "@/lib/dashboard-auth";
import { createMerchantAccount } from "@/lib/merchant-account";
import { findAnyOrg } from "@/lib/onboarding-status";
import {
  LEGAL_FORMS,
  normalizeTaxIdentity,
  validateTaxIdentity,
  type BillingModel,
  type BusinessType,
  type LegalForm,
  type ProviderStatus,
} from "@/app/onboarding/_components/onboarding-options";

/**
 * Finish merchant onboarding: organization, tax profile, and merchant profile.
 *
 * Writes to three tables that have no transaction between them (PostgREST gives
 * us one statement at a time), so the order is chosen to fail safe:
 *
 *   1. organization + owner membership — createMerchantAccount already rolls
 *      the org back if the membership insert fails, since an org nobody belongs
 *      to is invisible AND has burned its slug.
 *   2. tax profile — the thing a first charge needs.
 *   3. org profile, with `onboarding_completed_at` set LAST.
 *
 * That last ordering is the whole trick. `onboarding_completed_at` is the gate
 * the dashboard reads, so it must be the final write: if anything above it
 * fails, the user still counts as un-onboarded and the wizard resumes rather
 * than handing them a dashboard whose first charge would fail.
 */

const BUSINESS_TYPES = new Set<BusinessType>([
  "telegram",
  "edtech",
  "saas",
  "fitness",
  "media",
  "services",
  "other",
]);
const LEGAL_FORM_KEYS = new Set<LegalForm>([
  "legal_entity",
  "individual_entrepreneur",
  "self_employed",
]);
const BILLING_MODELS = new Set<BillingModel>(["subscriptions", "one_off", "both"]);
const PROVIDER_STATUSES = new Set<ProviderStatus>(["atmos", "uzum", "both", "none"]);

type Body = {
  name?: string;
  businessType?: string;
  legalForm?: string;
  taxIdentity?: string;
  billingModel?: string;
  contactPhone?: string | null;
  telegram?: string | null;
  providerStatus?: string;
};

function optional(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed.slice(0, 120) : null;
}

export async function POST(req: Request) {
  try {
    const { user } = await getAuthenticatedUserOrThrow();
    const body = (await req.json()) as Body;

    const name = typeof body.name === "string" ? body.name.trim() : "";
    if (!name) return NextResponse.json({ error: "name_required" }, { status: 400 });

    const businessType = body.businessType as BusinessType;
    const legalForm = body.legalForm as LegalForm;
    const billingModel = (body.billingModel ?? "subscriptions") as BillingModel;
    const providerStatus = (body.providerStatus ?? "none") as ProviderStatus;

    if (!BUSINESS_TYPES.has(businessType)) {
      return NextResponse.json({ error: "business_type_invalid" }, { status: 400 });
    }
    if (!LEGAL_FORM_KEYS.has(legalForm)) {
      return NextResponse.json({ error: "legal_form_invalid" }, { status: 400 });
    }
    if (!BILLING_MODELS.has(billingModel)) {
      return NextResponse.json({ error: "billing_model_invalid" }, { status: 400 });
    }
    if (!PROVIDER_STATUSES.has(providerStatus)) {
      return NextResponse.json({ error: "provider_status_invalid" }, { status: 400 });
    }

    // Re-validated server-side. The client checks the same rule for a good
    // error message, but a client check is a convenience, never the guard.
    const taxIdentity = normalizeTaxIdentity(String(body.taxIdentity ?? ""));
    const taxCheck = validateTaxIdentity(taxIdentity, legalForm);
    if (!taxCheck.ok) {
      return NextResponse.json({ error: "tax_identity_invalid" }, { status: 400 });
    }

    const admin = createAdminSupabase();

    // Attach to an existing organization rather than refusing.
    //
    // Every merchant who predates this wizard — including Krafta's own billing
    // org — has an organization but no `org_profiles` row. Refusing on "you
    // already have an org" sent exactly that population through five screens
    // and then rejected them at the last one, with no way forward. The only
    // state that genuinely cannot be onboarded twice is one that already
    // finished.
    const existing = await findAnyOrg(admin, user.id);
    if (existing) {
      const { data: profile, error: profileLookupErr } = await admin
        .schema("payments")
        .from("org_profiles")
        .select("onboarding_completed_at")
        .eq("org_id", existing.orgId)
        .maybeSingle();
      if (profileLookupErr) throw profileLookupErr;

      if (profile?.onboarding_completed_at) {
        return NextResponse.json({ error: "account_already_exists" }, { status: 409 });
      }
    }

    // Resolve the tax schema BEFORE creating anything. `org_tax_profiles.schema_id`
    // is NOT NULL with an FK, so a missing schema row would strand a
    // just-created org with no tax profile — better to fail with nothing
    // written than half-written.
    const { data: schema, error: schemaErr } = await admin
      .schema("payments")
      .from("tax_schemas")
      .select("id")
      .eq("code", "UZ_AUTOFISCAL_V1")
      .eq("is_active", true)
      .maybeSingle();
    if (schemaErr) throw schemaErr;
    if (!schema) {
      console.error("onboarding blocked: UZ_AUTOFISCAL_V1 tax schema is not seeded");
      return NextResponse.json({ error: "tax_schema_missing" }, { status: 500 });
    }

    let account: { orgId: string; orgSlug: string; orgName: string };

    if (existing) {
      // Keep the slug. It is already in this merchant's bookmarks and in every
      // dashboard URL they have shared; renaming the business should not break
      // those. Only the display name follows what they typed.
      const { error: renameErr } = await admin
        .from("organizations")
        .update({ name, country_iso2: "UZ", updated_at: new Date().toISOString() })
        .eq("id", existing.orgId);
      if (renameErr) throw renameErr;
      account = { orgId: existing.orgId, orgSlug: existing.orgSlug, orgName: name };
    } else {
      account = await createMerchantAccount(admin, {
        userId: user.id,
        name,
        countryIso2: "UZ",
      });
    }

    const { error: taxErr } = await admin
      .schema("payments")
      .from("org_tax_profiles")
      .upsert(
        {
          org_id: account.orgId,
          country_iso2: "UZ",
          schema_id: schema.id,
          tax_identity_type: LEGAL_FORMS[legalForm].identityType,
          tax_identity_value: taxIdentity,
          metadata: { source: "onboarding", legal_form: legalForm },
        },
        { onConflict: "org_id" },
      );
    if (taxErr) throw taxErr;

    const { error: profileErr } = await admin
      .schema("payments")
      .from("org_profiles")
      .upsert(
        {
          org_id: account.orgId,
          business_type: businessType,
          legal_form: legalForm,
          billing_model: billingModel,
          contact_phone: optional(body.contactPhone),
          telegram: optional(body.telegram),
          provider_status: providerStatus,
          onboarding_completed_at: new Date().toISOString(),
          metadata: { created_by_user_id: user.id },
        },
        { onConflict: "org_id" },
      );
    if (profileErr) throw profileErr;

    return NextResponse.json({ ok: true, account }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "onboarding_failed";
    const status = message === "unauthorized" ? 401 : message === "name_required" ? 400 : 500;
    if (status === 500) console.error("onboarding failed", { message, error });
    return NextResponse.json({ error: message }, { status });
  }
}
