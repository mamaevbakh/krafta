import { convertToModelMessages, streamText, type UIMessage } from "ai";
import { createClient } from "@supabase/supabase-js";

import { buildShopAssistant } from "@/lib/agents/shop-assistant";
import { normalizeBehaviorSettings } from "@/lib/catalogs/settings/behavior";
import type { Database } from "@/lib/supabase/types";

export const maxDuration = 30;

type ChatRequest = {
  messages?: UIMessage[];
  catalogId?: string;
  orgId?: string | null;
};

// Public storefront chat endpoint for the conversational shopping assistant.
// Scope (catalogId/orgId) comes from the client; the assistant's catalog access
// is bound server-side in the searchCatalog tool. The endpoint refuses unless
// the merchant has enabled the assistant for this catalog — so toggling it off
// in Settings also closes the API, not just the UI affordance.
export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as ChatRequest | null;
  const messages = body?.messages;
  const catalogId = body?.catalogId;

  if (!Array.isArray(messages) || !catalogId) {
    return new Response("Invalid request.", { status: 400 });
  }

  const supabaseUrl =
    process.env.KRAFTA_SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey =
    process.env.KRAFTA_SUPABASE_SECRET_KEY ??
    process.env.KRAFTA_SUPABASE_SERVICE_ROLE_KEY ??
    process.env.SUPABASE_SECRET_KEY;

  if (!supabaseUrl || !serviceKey) {
    return new Response("Assistant is not configured.", { status: 500 });
  }

  const supabase = createClient<Database>(supabaseUrl, serviceKey, {
    auth: { persistSession: false },
  });

  const { data: catalog, error } = await supabase
    .from("catalogs")
    .select("name, slug, org_id, settings_behavior")
    .eq("id", catalogId)
    .maybeSingle();

  if (error || !catalog) {
    return new Response("Catalog not found.", { status: 404 });
  }

  const behavior = normalizeBehaviorSettings(
    (catalog.settings_behavior ?? {}) as Record<string, unknown>,
  );
  if (!behavior.enableAssistant) {
    return new Response("Assistant is disabled for this catalog.", {
      status: 403,
    });
  }

  try {
    const assistant = buildShopAssistant({
      catalogId,
      orgId: catalog.org_id ?? body?.orgId ?? null,
      catalogSlug: catalog.slug,
      shopName: catalog.name,
    });

    const result = streamText({
      ...assistant,
      messages: await convertToModelMessages(messages),
    });

    return result.toUIMessageStreamResponse();
  } catch {
    return new Response("Assistant request failed.", { status: 500 });
  }
}
