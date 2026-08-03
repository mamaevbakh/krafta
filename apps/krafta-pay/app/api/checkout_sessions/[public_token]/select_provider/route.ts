import { NextResponse } from "next/server";
import { createAdminSupabase } from "@/lib/supabase-admin";
import { selectProviderCreateAttempt, writePaymentDebugLog } from "@krafta/payments-core";
import { resolveCheckoutEnvironment } from "@/lib/checkout-environment";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ public_token: string }> }
) {
  try {
    const supabase = createAdminSupabase();
    const body = await req.json();
    const { public_token } = await params;

    const environment = await resolveCheckoutEnvironment(supabase, public_token);
    const payBaseUrl = process.env.PAY_BASE_URL ?? "http://localhost:3001";
    const providerId = String(body.providerId ?? "");
    // Allowlist of providers wired end-to-end. Phase 1 adds "atmos" once its
    // adapter + inline routes exist; payme/click remain stubs and stay excluded.
    const ENABLED_PROVIDERS = new Set(["uzum", "atmos"]);
    if (!ENABLED_PROVIDERS.has(providerId)) {
      return NextResponse.json(
        { error: "provider_not_enabled" },
        { status: 400 },
      );
    }

    // Subscriptions were Atmos-only here. That was a phase-1 product gate, not a
    // technical limit: chargeRenewal has always listed uzum in
    // RECURRING_PROVIDERS and createUzumRecurringCharge is implemented. The
    // ENABLED_PROVIDERS allowlist above remains the real guard — payme and
    // click are still stubs and stay excluded.
    const requestedViewType =
      body.viewType === "WEB_VIEW" || body.viewType === "REDIRECT" || body.viewType === "IFRAME"
        ? body.viewType
        : "WEB_VIEW";

    await writePaymentDebugLog(supabase, {
      scope: "checkout_api",
      event: "select_provider.request",
      providerId,
      publicToken: public_token,
      data: {
        requestedViewType,
        payBaseUrl,
        environment,
      },
    });

    const result = await selectProviderCreateAttempt(
      supabase,
      { publicToken: public_token, providerId, viewType: requestedViewType },
      environment,
      payBaseUrl
    );

    await writePaymentDebugLog(supabase, {
      scope: "checkout_api",
      event: "select_provider.success",
      providerId,
      publicToken: public_token,
      data: {
        attemptId: (result as any).attemptId ?? null,
        hasRedirectUrl: Boolean((result as any).redirectUrl),
      },
    });

    return NextResponse.json(result);
  } catch (error) {
    const err = error as { message?: string };
    const message = err?.message ?? (typeof error === "string" ? error : "Unknown error");
    console.error("select_provider failed", message);
    try {
      const { public_token } = await params;
      const supabase = createAdminSupabase();
      await writePaymentDebugLog(supabase, {
        scope: "checkout_api",
        event: "select_provider.error",
        level: "error",
        publicToken: public_token,
        data: {
          error: message,
        },
      });
    } catch {}
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
