import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { getUserSafely } from "@krafta/supabase/auth";
import { getRequestOrigin } from "@/lib/auth/redirect";
import { hasSsoRuntimeConfig } from "@/lib/auth/sso";
import { createKraftaPayCustomerPortalSession } from "@/lib/billing/pay-client";

function resolveAppBaseUrl(origin: string) {
  const configured = process.env.KRAFTA_APP_URL?.trim();
  return configured && configured.length > 0 ? configured : origin;
}

function redirectToBilling(req: Request, orgSlug: string, catalogSlug: string, error: string) {
  const url = new URL(req.url);
  url.pathname = `/dashboard/${orgSlug}/${catalogSlug}/billing`;
  url.search = "";
  url.searchParams.set("error", error);
  return NextResponse.redirect(url, { status: 303 });
}

export async function POST(req: Request) {
  const formData = await req.formData();
  const customerOrgId = String(formData.get("customerOrgId") ?? "");
  const orgSlug = String(formData.get("orgSlug") ?? "");
  const catalogSlug = String(formData.get("catalogSlug") ?? "");

  if (!customerOrgId || !orgSlug || !catalogSlug) {
    return redirectToBilling(req, orgSlug, catalogSlug, "Missing required fields");
  }

  const supabase = await createClient();
  const { user: authUser, authError } = await getUserSafely(supabase);
  if (authError || !authUser) {
    const next = `/dashboard/${orgSlug}/${catalogSlug}/billing`;
    const entryUrl = new URL(hasSsoRuntimeConfig() ? "/auth/sso/start" : "/login", req.url);
    entryUrl.searchParams.set("next", next);
    return NextResponse.redirect(entryUrl, { status: 303 });
  }

  const { data: membership, error: membershipErr } = await supabase
    .from("organization_members")
    .select("id")
    .eq("org_id", customerOrgId)
    .eq("user_id", authUser.id)
    .maybeSingle();
  if (membershipErr) {
    return redirectToBilling(req, orgSlug, catalogSlug, membershipErr.message);
  }
  if (!membership) {
    return redirectToBilling(req, orgSlug, catalogSlug, "Forbidden");
  }

  const origin = getRequestOrigin(await headers());
  const appBaseUrl = resolveAppBaseUrl(origin).replace(/\/+$/, "");
  const returnUrl = `${appBaseUrl}/dashboard/${orgSlug}/${catalogSlug}/billing`;

  try {
    const portal = await createKraftaPayCustomerPortalSession({
      customerOrgId,
      customerUserRef: authUser.id,
      returnUrl,
      metadata: {
        source: "krafta_billing_page",
        org_slug: orgSlug,
        catalog_slug: catalogSlug,
        initiated_by_user_id: authUser.id,
      },
    });
    return NextResponse.redirect(portal.url, { status: 303 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to create customer portal session";
    console.error("billing customer portal redirect route failed", {
      message,
      error,
      orgSlug,
      catalogSlug,
      customerOrgId,
    });
    return redirectToBilling(req, orgSlug, catalogSlug, message);
  }
}
