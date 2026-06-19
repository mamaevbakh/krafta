"use server";

import { createClient } from "@/lib/supabase/server";

/**
 * tma-actions.ts — merchant opt-in for the Telegram Mini App storefront.
 *
 * Flipping `venues.tma_enabled` is the gate `/api/tma/session` checks before
 * minting a session for this shop (see lib/telegram/tma-session.ts). The route
 * reads the DB directly with no caching, so the toggle takes effect on the
 * merchant's next Mini App open — no revalidation needed. RLS scopes the update
 * to the merchant's own venue.
 */

type Result = { ok: true } | { ok: false; error: string };

export async function setTmaEnabled(params: {
  venueId: string;
  enabled: boolean;
}): Promise<Result> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("venues")
    .update({ tma_enabled: params.enabled })
    .eq("id", params.venueId);

  return error ? { ok: false, error: error.message } : { ok: true };
}
