import type { SupabaseClient } from "@supabase/supabase-js";

import { getCommerceAdminClient } from "@/lib/commerce-sdk";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { getUserSafely } from "@krafta/supabase/auth";
import { issueCommerceKey } from "@/lib/commerce-sdk/issue-key";
import type { CommerceKeyType } from "@/lib/commerce-sdk/api-keys";
import type { Database } from "@/lib/supabase/types";

export const maxDuration = 30;

// Dashboard-only (cookie + org-membership gated, NOT a public key endpoint):
// issue + list a shop's commerce API keys. Same authorization pattern as the
// Studio agent route — the signed-in user must own/administer the catalog's org.
// Issuance returns the raw token ONCE; listing never exposes it.
async function authorizeCatalog(
  catalogId: string,
): Promise<
  | { ok: true; admin: SupabaseClient<Database>; orgId: string }
  | { ok: false; response: Response }
> {
  const admin = getCommerceAdminClient();
  if (!admin) {
    return { ok: false, response: Response.json({ error: "not_configured" }, { status: 500 }) };
  }

  const { data: catalog } = await admin
    .from("catalogs")
    .select("org_id")
    .eq("id", catalogId)
    .maybeSingle();
  if (!catalog) {
    return { ok: false, response: Response.json({ error: "catalog_not_found" }, { status: 404 }) };
  }

  const supabase = await createServerClient();
  const { user, authError } = await getUserSafely(supabase);
  if (authError || !user) {
    return { ok: false, response: Response.json({ error: "auth_required" }, { status: 401 }) };
  }

  const { data: membership } = await supabase
    .from("organization_members")
    .select("id")
    .eq("org_id", catalog.org_id)
    .eq("user_id", user.id)
    .in("role", ["owner", "admin"])
    .maybeSingle();
  if (!membership) {
    return { ok: false, response: Response.json({ error: "forbidden" }, { status: 403 }) };
  }

  return { ok: true, admin, orgId: catalog.org_id as string };
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as {
    catalogId?: string;
    keyType?: CommerceKeyType;
    name?: string;
  } | null;
  if (!body?.catalogId) {
    return Response.json({ error: "catalogId_required" }, { status: 400 });
  }

  const auth = await authorizeCatalog(body.catalogId);
  if (!auth.ok) return auth.response;

  const issued = await issueCommerceKey({
    admin: auth.admin,
    orgId: auth.orgId,
    catalogId: body.catalogId,
    keyType: body.keyType,
    name: body.name,
  });
  if (!issued) return Response.json({ error: "issue_failed" }, { status: 500 });

  return Response.json(issued);
}

export async function GET(request: Request) {
  const catalogId = new URL(request.url).searchParams.get("catalogId");
  if (!catalogId) {
    return Response.json({ error: "catalogId_required" }, { status: 400 });
  }

  const auth = await authorizeCatalog(catalogId);
  if (!auth.ok) return auth.response;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- table not in generated types until regen
  const db = auth.admin as any;
  const { data } = await db
    .schema("commerce")
    .from("api_keys")
    .select("id, name, key_type, environment, prefix, last4, created_at, revoked_at")
    .eq("catalog_id", catalogId)
    .order("created_at", { ascending: false });

  return Response.json({ keys: data ?? [] });
}
