import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { getUserSafely } from "@krafta/supabase/auth";
import { createClient as createSessionClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/types";

/**
 * authorize.ts — the auth gate for every /api/items/media/* handler.
 *
 * These routes write with the service-role client on purpose (RLS bypass,
 * see the KRA-88 notes in route.ts), and proxy.ts's matcher excludes /api
 * entirely — so this module is the ONLY authorization these endpoints get.
 * The check mirrors the item_media INSERT/UPDATE/DELETE RLS policies
 * exactly: caller must hold owner/admin on the org that owns the item's
 * catalog, decided by the same is_org_role SQL function the policies call
 * (invoked through the caller's cookie session so auth.uid() resolves).
 *
 * Failures are returned as plain descriptors — not NextResponse — so the
 * decision logic stays importable from vitest without pulling next/server.
 */

type ServiceClient = SupabaseClient<Database>;

/** Mirrors the role array in the item_media write policies. */
const MEDIA_WRITE_ROLES = ["owner", "admin"];

export type MediaAuthFailure = {
  ok: false;
  status: 401 | 403 | 404;
  error: string;
};

export type OrgMediaAuth = { ok: true } | MediaAuthFailure;
export type ItemMediaAuth =
  | { ok: true; catalogId: string; orgId: string }
  | MediaAuthFailure;

function fail(status: MediaAuthFailure["status"], error: string): MediaAuthFailure {
  return { ok: false, status, error };
}

async function sessionGate() {
  const supabase = await createSessionClient();
  // getUserSafely (same as the catalogs/logo gate) folds stale-refresh-token
  // and thrown auth errors into "no user" → a clean 401 instead of a 500.
  const { user, authError } = await getUserSafely(supabase);
  if (authError || !user) return null;
  return {
    async hasWriteRole(orgId: string) {
      const { data: allowed, error } = await supabase.rpc("is_org_role", {
        _org_id: orgId,
        _roles: MEDIA_WRITE_ROLES,
      });
      // Fail closed: an RPC error denies rather than allows.
      return !error && allowed === true;
    },
  };
}

/**
 * Require a signed-in caller holding owner/admin on EVERY org in orgIds.
 * 401 without a session, 403 on any missing role.
 */
export async function requireOrgMediaRole(orgIds: string[]): Promise<OrgMediaAuth> {
  const gate = await sessionGate();
  if (!gate) return fail(401, "Authentication required.");
  for (const orgId of new Set(orgIds)) {
    if (!(await gate.hasWriteRole(orgId))) {
      return fail(403, "You do not have permission to manage this organization's media.");
    }
  }
  return { ok: true };
}

/**
 * Resolve the item's owning org (item → catalog → org, service-role
 * lookups since the caller may not be able to SELECT the row) and require
 * owner/admin on it. Session is checked before the item lookup so
 * unauthenticated probes can't distinguish which item ids exist.
 * On success returns the item's catalogId (for cache revalidation) and
 * the owning orgId (for storage-path ownership checks against
 * mediaPathOrgId below), saving callers the re-fetch they all need.
 */
export async function requireItemMediaRole(
  service: ServiceClient,
  itemId: string,
): Promise<ItemMediaAuth> {
  const gate = await sessionGate();
  if (!gate) return fail(401, "Authentication required.");

  const { data: item, error: itemError } = await service
    .from("items")
    .select("catalog_id")
    .eq("id", itemId)
    .maybeSingle();
  if (itemError || !item) {
    return fail(404, itemError?.message ?? "Item not found.");
  }

  const { data: catalog } = await service
    .from("catalogs")
    .select("org_id")
    .eq("id", item.catalog_id)
    .maybeSingle();
  if (!catalog) return fail(404, "Catalog not found.");

  if (!(await gate.hasWriteRole(catalog.org_id))) {
    return fail(403, "You do not have permission to manage this item's media.");
  }

  return { ok: true, catalogId: item.catalog_id, orgId: catalog.org_id };
}

/**
 * Extract the org id from a storage path minted by the upload-url route
 * (`org/<orgId>/catalog/<catalogId>/item/<itemId>/media/<mediaId>/<file>`).
 * Returns null for anything that doesn't match — the cleanup route refuses
 * to touch paths it didn't mint, which is what keeps a service-role
 * storage.remove from being an arbitrary-file-delete primitive.
 */
const MEDIA_PATH_RE =
  /^org\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\/catalog\//;

export function mediaPathOrgId(storagePath: string): string | null {
  const match = MEDIA_PATH_RE.exec(storagePath);
  return match ? match[1] : null;
}
