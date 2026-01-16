import { NextResponse } from "next/server";
import { createAdminSupabase } from "@/lib/supabase-admin";
import { selectProviderCreateAttempt } from "@krafta/payments-core";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ public_token: string }> }
) {
  try {
    const supabase = createAdminSupabase();
    const body = await req.json();
    const { public_token } = await params;

    const environment = (process.env.PAY_ENV ?? "live") as "test" | "live";
    const payBaseUrl = process.env.PAY_BASE_URL ?? "http://localhost:3001";

    const result = await selectProviderCreateAttempt(
      supabase,
      { publicToken: public_token, providerId: body.providerId },
      environment,
      payBaseUrl
    );

    return NextResponse.json(result);
  } catch (error) {
    const err = error as { message?: string };
    const message = err?.message ?? (typeof error === "string" ? error : "Unknown error");
    console.error("select_provider failed", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
