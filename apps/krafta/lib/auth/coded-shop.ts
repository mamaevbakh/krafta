import "server-only";

import { createClient } from "@/lib/supabase/server";
import { getCommerceAdminClient } from "@/lib/commerce-sdk";
import { issueCommerceKey } from "@/lib/commerce-sdk/issue-key";
import { assertOrgFeature } from "@/lib/billing/gate";

// Krafta Studio — create a NEW coded shop inside an org the caller already owns.
// Sibling to merchant-shop.ts (which only mints the merchant's FIRST shop). This
// adds a catalog to an existing org via the create_coded_shop RPC (org owner/
// admin enforced inside it), then issues + persists the shop's publishable
// commerce key so the Studio builder can hand it to the codegen sandbox.

export type CodedShop = {
  orgSlug: string;
  catalogSlug: string;
  orgId: string;
  catalogId: string;
  publishableKey: string;
};

// 8-char base36 creation slug (same scheme as merchant-shop.ts). catalogs.slug is
// globally UNIQUE; we retry on collision.
function randomSlug(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  return Array.from(bytes)
    .map((b) => (b % 36).toString(36))
    .join("");
}

export async function createCodedShop(options: {
  orgId: string;
  name?: string;
}): Promise<CodedShop> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Authentication required.");

  // The org's slug drives the dashboard redirect (/dashboard/[orgSlug]/...).
  const { data: org } = await supabase
    .from("organizations")
    .select("slug")
    .eq("id", options.orgId)
    .maybeSingle();
  if (!org) throw new Error("Organization not found.");

  // Multiple venues is a Business-tier feature. The first shop for an org is
  // always allowed (any tier can have one storefront); a 2nd+ requires Business.
  const { count: existingCatalogs } = await supabase
    .from("catalogs")
    .select("id", { count: "exact", head: true })
    .eq("org_id", options.orgId);
  if ((existingCatalogs ?? 0) >= 1) {
    await assertOrgFeature(options.orgId, "multi_venue");
  }

  // Provision the catalog + venue. The RPC re-checks owner/admin membership, so
  // a forged orgId is rejected at the DB. Retry on creation-slug collision.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- RPC not in generated types until regen
  const db = supabase as any;
  const maxAttempts = 5;
  let created: { org_id: string; catalog_id: string; slug: string } | null = null;
  let lastError: unknown = null;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const slug = randomSlug();
    const { data, error } = await db
      .rpc("create_coded_shop", {
        p_org_id: options.orgId,
        p_slug: slug,
        ...(options.name ? { p_name: options.name } : {}),
      })
      .single();
    if (error) {
      const code = (error as { code?: string }).code;
      const msg = (error as { message?: string }).message ?? "";
      if (code === "23505" || msg.includes("duplicate key")) {
        lastError = error;
        continue;
      }
      throw new Error(msg || "create_coded_shop failed");
    }
    if (!data) throw new Error("create_coded_shop returned no row");
    created = data as { org_id: string; catalog_id: string; slug: string };
    break;
  }
  if (!created) {
    throw new Error(
      `Failed to allocate a unique shop slug after ${maxAttempts} attempts: ${String(lastError)}`,
    );
  }

  // Issue the publishable key (service-role) and persist the raw token on the
  // catalog — publishable keys are non-secret + browser-safe.
  const admin = getCommerceAdminClient();
  if (!admin) throw new Error("Commerce is not configured.");
  const key = await issueCommerceKey({
    admin,
    orgId: created.org_id,
    catalogId: created.catalog_id,
    keyType: "publishable",
    name: "Studio shop key",
  });
  if (!key) throw new Error("Failed to issue a commerce key.");

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- column not in generated types until regen
  await (admin as any)
    .from("catalogs")
    .update({ studio_publishable_key: key.token })
    .eq("id", created.catalog_id);

  return {
    orgSlug: org.slug,
    catalogSlug: created.slug,
    orgId: created.org_id,
    catalogId: created.catalog_id,
    publishableKey: key.token,
  };
}
