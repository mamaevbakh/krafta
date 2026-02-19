import { NextResponse } from "next/server";
import { createAdminSupabase } from "@/lib/supabase-admin";
import {
  getAuthenticatedUserOrThrow,
  requireOrgMembership,
} from "@/lib/dashboard-auth";

type PlanBody = {
  orgId: string;
  planId?: string;
  name?: string;
  code?: string;
  amountMinor?: number;
  currency?: string;
  intervalCount?: number;
  trialDays?: number;
  isActive?: boolean;
  spic?: string | null;
  packageCode?: string | null;
};

const DEFAULT_SCHEMA_CODE = "UZ_AUTOFISCAL_V1";
const DEFAULT_REGISTRY_NAME = "Default UZ Registry";

function parseOrgId(value: unknown) {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error("orgId_required");
  }
  return value.trim();
}

function normalizeSpic(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed;
}

function normalizePackageCode(value: unknown): string | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(Math.trunc(value));
  }
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed;
}

function extractSpic(metadata: unknown): string | null {
  if (!metadata || typeof metadata !== "object") return null;
  const m = metadata as Record<string, unknown>;
  const direct = normalizeSpic(m.spic);
  if (direct) return direct;

  const fiscalization = m.fiscalization;
  if (fiscalization && typeof fiscalization === "object") {
    const nested = fiscalization as Record<string, unknown>;
    const nestedSpic = normalizeSpic(nested.spic);
    if (nestedSpic) return nestedSpic;
  }

  return null;
}

function extractPackageCode(metadata: unknown): string | null {
  if (!metadata || typeof metadata !== "object") return null;
  const m = metadata as Record<string, unknown>;
  const direct = normalizePackageCode(m.packageCode ?? m.package_code);
  if (direct) return direct;

  const fiscalization = m.fiscalization;
  if (fiscalization && typeof fiscalization === "object") {
    const nested = fiscalization as Record<string, unknown>;
    const nestedPackageCode = normalizePackageCode(
      nested.packageCode ?? nested.package_code,
    );
    if (nestedPackageCode) return nestedPackageCode;
  }

  return null;
}

function mergeMetadataWithFiscalization(
  base: unknown,
  fiscal: { spic?: string | null; packageCode?: string | null },
) {
  const record =
    base && typeof base === "object" && !Array.isArray(base)
      ? ({ ...(base as Record<string, unknown>) } as Record<string, unknown>)
      : {};

  const fiscalization =
    record.fiscalization &&
    typeof record.fiscalization === "object" &&
    !Array.isArray(record.fiscalization)
      ? ({
          ...(record.fiscalization as Record<string, unknown>),
        } as Record<string, unknown>)
      : {};

  if (typeof fiscal.spic !== "undefined") {
    if (fiscal.spic) {
      fiscalization.spic = fiscal.spic;
    } else {
      delete fiscalization.spic;
    }
  }

  if (typeof fiscal.packageCode !== "undefined") {
    if (fiscal.packageCode) {
      fiscalization.packageCode = fiscal.packageCode;
    } else {
      delete fiscalization.packageCode;
    }
  }

  if (fiscalization.package_code) {
    delete fiscalization.package_code;
  }

  if (record.spic) {
    delete record.spic;
  }
  if (record.package_code) {
    delete record.package_code;
  }
  if (record.packageCode) {
    delete record.packageCode;
  }

  if (Object.keys(fiscalization).length > 0) {
    record.fiscalization = fiscalization;
  } else {
    delete record.fiscalization;
  }

  return record;
}

async function ensureSchemaByCode(admin: any, schemaCode: string) {
  const { data: existing, error: existingErr } = await admin
    .schema("payments")
    .from("tax_schemas")
    .select("id")
    .eq("code", schemaCode)
    .maybeSingle();
  if (existingErr) throw existingErr;
  if (existing?.id) return existing.id as string;

  const { data: created, error: createErr } = await admin
    .schema("payments")
    .from("tax_schemas")
    .insert({
      code: schemaCode,
      name: schemaCode,
      country_iso2: "UZ",
      version: "v1",
      is_active: true,
      metadata: {},
    })
    .select("id")
    .single();
  if (createErr) throw createErr;
  return created.id as string;
}

async function ensureRegistry(admin: any, params: {
  orgId: string;
  schemaId: string;
}) {
  const { data: existing, error: existingErr } = await admin
    .schema("payments")
    .from("tax_code_registries")
    .select("id")
    .eq("org_id", params.orgId)
    .eq("schema_id", params.schemaId)
    .eq("name", DEFAULT_REGISTRY_NAME)
    .maybeSingle();
  if (existingErr) throw existingErr;
  if (existing?.id) return existing.id as string;

  const { data: created, error: createErr } = await admin
    .schema("payments")
    .from("tax_code_registries")
    .insert({
      org_id: params.orgId,
      schema_id: params.schemaId,
      name: DEFAULT_REGISTRY_NAME,
      source: "dashboard",
      is_active: true,
      metadata: {},
    })
    .select("id")
    .single();
  if (createErr) throw createErr;
  return created.id as string;
}

async function ensureTaxCodeEntry(admin: any, params: {
  registryId: string;
  taxCode: string;
  packageCode: string;
}) {
  const { data: existing, error: existingErr } = await admin
    .schema("payments")
    .from("tax_code_entries")
    .select("id")
    .eq("registry_id", params.registryId)
    .eq("tax_code", params.taxCode)
    .eq("package_code", params.packageCode)
    .maybeSingle();
  if (existingErr) throw existingErr;
  if (existing?.id) return existing.id as string;

  const { data: created, error: createErr } = await admin
    .schema("payments")
    .from("tax_code_entries")
    .insert({
      registry_id: params.registryId,
      tax_code: params.taxCode,
      package_code: params.packageCode,
      title: null,
      metadata: {},
    })
    .select("id")
    .single();
  if (createErr) throw createErr;
  return created.id as string;
}

async function upsertPlanTaxClassification(admin: any, params: {
  planId: string;
  schemaId: string;
  taxCodeEntryId: string | null;
  taxCode: string;
  packageCode: string;
}) {
  const payload = {
    plan_id: params.planId,
    schema_id: params.schemaId,
    tax_code_entry_id: params.taxCodeEntryId,
    tax_code: params.taxCode,
    package_code: params.packageCode,
    metadata: {},
    updated_at: new Date().toISOString(),
  };

  const { error } = await admin
    .schema("payments")
    .from("plan_tax_classifications")
    .upsert(payload, { onConflict: "plan_id" });
  if (error) throw error;
}

async function deletePlanTaxClassification(admin: any, planId: string) {
  const { error } = await admin
    .schema("payments")
    .from("plan_tax_classifications")
    .delete()
    .eq("plan_id", planId);
  if (error) throw error;
}

export async function GET(req: Request) {
  try {
    const { supabase, user } = await getAuthenticatedUserOrThrow();
    const url = new URL(req.url);
    const orgId = parseOrgId(url.searchParams.get("orgId"));

    await requireOrgMembership({
      supabase,
      userId: user.id,
      orgId,
      minRole: "member",
    });

    const admin = createAdminSupabase();
    const { data, error } = await admin
      .schema("payments")
      .from("plans")
      .select(
        "id, name, code, amount_minor, currency, interval, interval_count, trial_days, is_active, metadata, created_at, updated_at",
      )
      .eq("org_id", orgId)
      .order("created_at", { ascending: false });
    if (error) throw error;

    const planIds = (data ?? []).map((plan) => plan.id);
    const adminAny = admin as any;
    const { data: classifications, error: classificationsErr } = planIds.length
      ? await adminAny
          .schema("payments")
          .from("plan_tax_classifications")
          .select("plan_id, tax_code, package_code, tax_code_entry_id")
          .in("plan_id", planIds)
      : { data: [], error: null };
    if (classificationsErr) throw classificationsErr;

    const byPlanId = new Map<string, {
      tax_code?: string;
      package_code?: string;
      tax_code_entry_id?: string | null;
    }>();
    for (const row of classifications ?? []) {
      byPlanId.set(row.plan_id, row);
    }

    const plans = (data ?? []).map((plan) => ({
      id: plan.id,
      name: plan.name,
      code: plan.code,
      amount_minor: plan.amount_minor,
      currency: plan.currency,
      interval_count: plan.interval_count,
      trial_days: plan.trial_days,
      is_active: plan.is_active,
      spic: normalizeSpic(byPlanId.get(plan.id)?.tax_code) ?? extractSpic(plan.metadata),
      packageCode:
        normalizePackageCode(byPlanId.get(plan.id)?.package_code) ??
        extractPackageCode(plan.metadata),
      taxCodeEntryId: byPlanId.get(plan.id)?.tax_code_entry_id ?? null,
    }));

    return NextResponse.json({ plans });
  } catch (error) {
    const message = error instanceof Error ? error.message : "plans_get_failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const { supabase, user } = await getAuthenticatedUserOrThrow();
    const body = (await req.json()) as PlanBody;
    const orgId = parseOrgId(body.orgId);

    await requireOrgMembership({
      supabase,
      userId: user.id,
      orgId,
      minRole: "admin",
    });

    if (!body.name || !body.code) {
      return NextResponse.json({ error: "name and code are required" }, { status: 400 });
    }

    const spic = normalizeSpic(body.spic);
    const packageCode = normalizePackageCode(body.packageCode);
    if (spic && !packageCode) {
      return NextResponse.json(
        { error: "packageCode_required_when_spic_set" },
        { status: 400 },
      );
    }

    const admin = createAdminSupabase();
    const { data, error } = await admin
      .schema("payments")
      .from("plans")
      .insert({
        org_id: orgId,
        name: body.name,
        code: body.code,
        amount_minor: Math.max(0, Number(body.amountMinor ?? 0)),
        currency: body.currency ?? "UZS",
        interval: "month",
        interval_count: Math.max(1, Number(body.intervalCount ?? 1)),
        trial_days: Math.max(0, Number(body.trialDays ?? 0)),
        is_active: body.isActive ?? true,
        metadata: mergeMetadataWithFiscalization(
          {
            source: "dashboard",
            stage1: true,
          },
          { spic, packageCode },
        ) as any,
      })
      .select("id")
      .single();
    if (error) throw error;

    if (spic && packageCode) {
      const adminAny = admin as any;
      const schemaId = await ensureSchemaByCode(adminAny, DEFAULT_SCHEMA_CODE);
      const registryId = await ensureRegistry(adminAny, { orgId, schemaId });
      const taxCodeEntryId = await ensureTaxCodeEntry(adminAny, {
        registryId,
        taxCode: spic,
        packageCode,
      });
      await upsertPlanTaxClassification(adminAny, {
        planId: data.id,
        schemaId,
        taxCodeEntryId,
        taxCode: spic,
        packageCode,
      });
    }

    return NextResponse.json({ ok: true, planId: data.id }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "plans_create_failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  try {
    const { supabase, user } = await getAuthenticatedUserOrThrow();
    const body = (await req.json()) as PlanBody;
    const orgId = parseOrgId(body.orgId);
    if (!body.planId) {
      return NextResponse.json({ error: "planId is required" }, { status: 400 });
    }

    await requireOrgMembership({
      supabase,
      userId: user.id,
      orgId,
      minRole: "admin",
    });

    const admin = createAdminSupabase();
    const patch: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };
    if (typeof body.name === "string") patch.name = body.name;
    if (typeof body.code === "string") patch.code = body.code;
    if (typeof body.amountMinor !== "undefined") patch.amount_minor = Math.max(0, Number(body.amountMinor));
    if (typeof body.currency === "string") patch.currency = body.currency;
    if (typeof body.intervalCount !== "undefined") patch.interval_count = Math.max(1, Number(body.intervalCount));
    if (typeof body.trialDays !== "undefined") patch.trial_days = Math.max(0, Number(body.trialDays));
    if (typeof body.isActive === "boolean") patch.is_active = body.isActive;
    if (
      typeof body.spic !== "undefined" ||
      typeof body.packageCode !== "undefined"
    ) {
      const { data: existing, error: existingErr } = await admin
        .schema("payments")
        .from("plans")
        .select("metadata")
        .eq("id", body.planId)
        .eq("org_id", orgId)
        .maybeSingle();
      if (existingErr) throw existingErr;

      const normalizedSpic =
        typeof body.spic === "undefined" ? undefined : normalizeSpic(body.spic);
      const normalizedPackageCode =
        typeof body.packageCode === "undefined"
          ? undefined
          : normalizePackageCode(body.packageCode);

      const nextSpic =
        typeof normalizedSpic === "undefined"
          ? extractSpic(existing?.metadata)
          : normalizedSpic;
      const nextPackageCode =
        typeof normalizedPackageCode === "undefined"
          ? extractPackageCode(existing?.metadata)
          : normalizedPackageCode;

      if (nextSpic && !nextPackageCode) {
        return NextResponse.json(
          { error: "packageCode_required_when_spic_set" },
          { status: 400 },
        );
      }

      patch.metadata = mergeMetadataWithFiscalization(existing?.metadata, {
        spic: normalizedSpic,
        packageCode: normalizedPackageCode,
      }) as any;

      const adminAny = admin as any;
      if (nextSpic && nextPackageCode) {
        const schemaId = await ensureSchemaByCode(adminAny, DEFAULT_SCHEMA_CODE);
        const registryId = await ensureRegistry(adminAny, { orgId, schemaId });
        const taxCodeEntryId = await ensureTaxCodeEntry(adminAny, {
          registryId,
          taxCode: nextSpic,
          packageCode: nextPackageCode,
        });
        await upsertPlanTaxClassification(adminAny, {
          planId: body.planId,
          schemaId,
          taxCodeEntryId,
          taxCode: nextSpic,
          packageCode: nextPackageCode,
        });
      } else if (!nextSpic && !nextPackageCode) {
        await deletePlanTaxClassification(adminAny, body.planId);
      }
    }

    const { error } = await admin
      .schema("payments")
      .from("plans")
      .update(patch)
      .eq("id", body.planId)
      .eq("org_id", orgId);
    if (error) throw error;

    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "plans_patch_failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  try {
    const { supabase, user } = await getAuthenticatedUserOrThrow();
    const body = (await req.json()) as PlanBody;
    const orgId = parseOrgId(body.orgId);
    if (!body.planId) {
      return NextResponse.json({ error: "planId is required" }, { status: 400 });
    }

    await requireOrgMembership({
      supabase,
      userId: user.id,
      orgId,
      minRole: "admin",
    });

    const admin = createAdminSupabase();
    const adminAny = admin as any;
    await deletePlanTaxClassification(adminAny, body.planId);
    const { error } = await admin
      .schema("payments")
      .from("plans")
      .delete()
      .eq("id", body.planId)
      .eq("org_id", orgId);
    if (error) throw error;

    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "plans_delete_failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
