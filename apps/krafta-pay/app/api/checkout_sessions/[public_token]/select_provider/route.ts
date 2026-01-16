import { NextResponse } from "next/server";
import { createAdminSupabase } from "@/lib/supabase-admin";
import { selectProviderCreateAttempt } from "@krafta/payments-core";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ public_token: string }> }
) {
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
}
