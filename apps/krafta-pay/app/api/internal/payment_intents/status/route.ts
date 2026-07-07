import { NextResponse } from "next/server";
import { createAdminSupabase } from "@/lib/supabase-admin";
import { verifyInternalRequest } from "@/lib/internal-auth";

// Internal (HMAC-signed) batch status lookup by payment_intent id. The main
// Krafta app uses this to reconcile the local order_payments mirror for card
// orders whose customer never returned to the success page — the charge itself
// is safe (Atmos apply is synchronous + the reconcile cron recovers stuck
// intents on this side); this just lets the storefront learn the outcome.

type Body = { intentIds?: string[] };

export async function POST(req: Request) {
  try {
    const rawBody = await req.text();
    verifyInternalRequest({
      rawBody,
      timestampHeader: req.headers.get("x-krafta-timestamp"),
      signatureHeader: req.headers.get("x-krafta-signature"),
    });

    const body = JSON.parse(rawBody) as Body;
    const intentIds = Array.isArray(body?.intentIds)
      ? body.intentIds.filter((id): id is string => typeof id === "string").slice(0, 200)
      : [];
    if (intentIds.length === 0) {
      return NextResponse.json({ statuses: {} });
    }

    const admin = createAdminSupabase();
    const { data, error } = await admin
      .schema("payments")
      .from("payment_intents")
      .select("id, status")
      .in("id", intentIds);
    if (error) throw error;

    const statuses: Record<string, string> = {};
    for (const row of data ?? []) {
      statuses[row.id as string] = row.status as string;
    }

    return NextResponse.json({ statuses });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "internal_intent_status_failed";
    console.error("internal payment_intents status failed", { message });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
