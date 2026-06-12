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
    const viewTypeParam = url.searchParams.get("viewType");
    if (!providerId) throw new Error("missing_provider");
    if (providerId !== "uzum") throw new Error("provider_not_enabled_in_stage1");
    const viewType =
      viewTypeParam === "WEB_VIEW" || viewTypeParam === "REDIRECT" || viewTypeParam === "IFRAME"
        ? viewTypeParam
        : "WEB_VIEW";

    const supabase = createAdminSupabase();
    const { public_token } = await params;
    const environment = (process.env.PAY_ENV ?? "live") as "test" | "live";
    const payBaseUrl = process.env.PAY_BASE_URL ?? "http://localhost:3001";

    const { redirectUrl } = await selectProviderCreateAttempt(
      supabase,
      { publicToken: public_token, providerId, viewType },
      environment,
      payBaseUrl
    );

    if (!redirectUrl) throw new Error("provider_did_not_return_redirect_url");
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
