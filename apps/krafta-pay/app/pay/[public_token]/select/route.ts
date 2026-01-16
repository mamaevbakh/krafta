import { redirect } from "next/navigation";
import { createAdminSupabase } from "@/lib/supabase-admin";
import { selectProviderCreateAttempt } from "@krafta/payments-core";

function isNextRedirectError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "digest" in error &&
    typeof (error as any).digest === "string" &&
    (error as any).digest.startsWith("NEXT_REDIRECT")
  );
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ public_token: string }> }
) {
  try {
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
  } catch (error) {
    // In Next.js, `redirect()` works by throwing a special error.
    // If we catch it, the redirect won't happen.
    if (isNextRedirectError(error)) throw error;

    const err = error as { message?: string };
    const message = err?.message ?? (typeof error === "string" ? error : "Unknown error");
    console.error("pay select failed", message);
    return new Response(message, { status: 500 });
  }
}
