import { NextResponse } from "next/server";
import { createAdminSupabase } from "@/lib/supabase-admin";
import { handleWebhookEvent } from "@krafta/payments-core";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ provider: string }> }
) {
  const supabase = createAdminSupabase();
  const { provider } = await params;

  const rawBody = await req.text();
  const headers: Record<string, string | null> = {};
  req.headers.forEach((v, k) => (headers[k] = v));

  const environment = (process.env.PAY_ENV ?? "live") as "test" | "live";

  await handleWebhookEvent(
    supabase,
    { providerId: provider, rawBody, headers },
    environment
  );

  return NextResponse.json({ ok: true });
}
