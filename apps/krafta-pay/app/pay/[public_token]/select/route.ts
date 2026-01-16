import { redirect } from "next/navigation";
import { createAdminSupabase } from "@/lib/supabase-admin";
import { selectProviderCreateAttempt } from "@krafta/payments-core";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ public_token: string }> }
) {
  const url = new URL(req.url);
  const providerId = url.searchParams.get("provider");
  if (!providerId) throw new Error("missing_provider");

  const supabase = createAdminSupabase();
  const { public_token } = await params;
  const environment = (process.env.PAY_ENV ?? "live") as "test" | "live";
  const payBaseUrl = process.env.PAY_BASE_URL ?? "http://localhost:3001";

  const { redirectUrl } = await selectProviderCreateAttempt(
    supabase,
    { publicToken: public_token, providerId },
    environment,
    payBaseUrl
  );

  redirect(redirectUrl);
}
