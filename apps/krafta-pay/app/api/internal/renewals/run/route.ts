import { NextResponse } from "next/server";
import { createAdminSupabase } from "@/lib/supabase-admin";
import { verifyInternalRequest } from "@/lib/internal-auth";
import { runRenewalCycle } from "@krafta/payments-core";

export async function POST(req: Request) {
  try {
    const rawBody = await req.text();
    verifyInternalRequest({
      rawBody,
      timestampHeader: req.headers.get("x-krafta-timestamp"),
      signatureHeader: req.headers.get("x-krafta-signature"),
    });

    const payload = rawBody ? (JSON.parse(rawBody) as { date?: string }) : {};
    const runAt = payload.date ? new Date(payload.date) : new Date();
    if (Number.isNaN(runAt.getTime())) {
      return NextResponse.json({ error: "invalid date" }, { status: 400 });
    }

    const supabase = createAdminSupabase();
    const result = await runRenewalCycle(supabase, runAt);

    return NextResponse.json({ ok: true, result });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "renewal_run_failed";
    console.error("renewal run failed", { message });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
