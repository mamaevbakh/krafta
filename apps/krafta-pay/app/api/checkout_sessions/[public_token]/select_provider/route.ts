import { NextResponse } from "next/server";
import { createAdminSupabase } from "@/lib/supabase-admin";
import { selectProviderCreateAttempt, writePaymentDebugLog } from "@krafta/payments-core";

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
    const providerId = String(body.providerId ?? "");
    if (providerId !== "uzum") {
      return NextResponse.json(
        { error: "provider_not_enabled_in_stage1" },
        { status: 400 },
      );
    }
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
