import { convertToModelMessages, streamText, type UIMessage } from "ai";

import { buildStudioAgent } from "@/lib/agents/studio-agent";
import { getCommerceAdminClient } from "@/lib/commerce-sdk";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { getUserSafely } from "@krafta/supabase/auth";

export const maxDuration = 30;

type StudioChatRequest = {
  messages?: UIMessage[];
  catalogId?: string;
  orgId?: string | null;
};

/**
 * Krafta Studio agent endpoint (merchant-facing, dashboard-only).
 *
 * Unlike the public storefront assistant, this is gated by ORG MEMBERSHIP: the
 * service client bypasses RLS, so the only authorization gate is the
 * organization_members check against the cookie-scoped session (same pattern as
 * the catalog logo/banner upload routes). A caller can only talk to the Studio
 * agent for a catalog whose org they own or administer. The catalogId/orgId the
 * agent's tools see are derived from the verified catalog row, not trusted from
 * the body.
 */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as StudioChatRequest | null;
  const messages = body?.messages;
  const catalogId = body?.catalogId;

  if (!Array.isArray(messages) || !catalogId) {
    return new Response("Invalid request.", { status: 400 });
  }

  const admin = getCommerceAdminClient();
  if (!admin) {
    return new Response("Studio is not configured.", { status: 500 });
  }

  const { data: catalog, error } = await admin
    .from("catalogs")
    .select("name, slug, org_id")
    .eq("id", catalogId)
    .maybeSingle();

  if (error || !catalog) {
    return new Response("Catalog not found.", { status: 404 });
  }

  // Authorize: the signed-in user must own/administer this catalog's org.
  const supabase = await createServerClient();
  const { user, authError } = await getUserSafely(supabase);
  if (authError || !user) {
    return new Response("Authentication required.", { status: 401 });
  }

  const { data: membership } = await supabase
    .from("organization_members")
    .select("id")
    .eq("org_id", catalog.org_id)
    .eq("user_id", user.id)
    .in("role", ["owner", "admin"])
    .maybeSingle();

  if (!membership) {
    return new Response("You do not have access to this shop.", { status: 403 });
  }

  try {
    const agent = buildStudioAgent({
      catalogId,
      orgId: catalog.org_id,
      catalogSlug: catalog.slug,
      shopName: catalog.name,
    });

    const result = streamText({
      ...agent,
      messages: await convertToModelMessages(messages),
    });

    return result.toUIMessageStreamResponse();
  } catch {
    return new Response("Studio request failed.", { status: 500 });
  }
}
