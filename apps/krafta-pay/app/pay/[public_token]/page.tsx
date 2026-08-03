import { createAdminSupabase } from "@/lib/supabase-admin";
import { notFound } from "next/navigation";
import { BrandWordmark } from "@/components/brand/brand-wordmark";
import { ProviderPicker } from "./provider-picker.client";
import { AtmosCardForm } from "./atmos-card-form.client";
import { CheckoutStatusWatcher } from "./checkout-status.client";
import { formatMinorAmount } from "@/lib/format";
import { getCheckoutT } from "@/lib/locales/checkout";
import { PayLocaleProvider } from "@/lib/locales/context";

function isTerminalStatus(status?: string | null) {
  const s = (status ?? "").toLowerCase();
  return s === "succeeded" || s === "failed" || s === "canceled" || s === "cancelled";
}

export default async function PayPage({
  params,
  searchParams,
}: {
  params: Promise<{ public_token: string }>;
  searchParams: Promise<{ lang?: string }>;
}) {
  const { public_token } = await params;
  const sp = await searchParams;

  const supabase = createAdminSupabase();

  const { data: session, error } = await supabase
    .schema("payments")
    .from("checkout_sessions")
    .select(
      // `metadata` drives the Atmos-only subscription guard below; `environment`
      // decides which provider account can charge. Both are load-bearing.
      "id, status, org_id, public_token, payment_intent_id, selected_provider_id, selected_attempt_id, success_url, cancel_url, return_url, updated_at, metadata, environment, payment_intents:payment_intent_id(amount_minor, currency, description, status, updated_at, order_id)"
    )
    .eq("public_token", public_token)
    .maybeSingle();

  if (error) throw error;
  if (!session) notFound();

  // Environment comes from the checkout itself, never from a process-global
  // PAY_ENV — otherwise a test-mode checkout on the live deployment would
  // resolve the LIVE Atmos account and charge a real card.
  // The CUSTOMER's language, not the merchant's: ?lang= → session metadata →
  // their Accept-Language. A merchant running the console in English still has
  // customers who need «Срок действия» before typing a card number.
  const { locale, t } = await getCheckoutT({
    langParam: sp.lang,
    sessionMetadata: (session as { metadata?: unknown }).metadata,
  });

  const env: "test" | "live" =
    (session as { environment?: string }).environment === "test" ? "test" : "live";

  const intent = (session as any).payment_intents;
  const initialIntentStatus = (intent as any)?.status as string | undefined;
  // A `failed` intent under a still-OPEN session is a deliberate retry link
  // (see createRecoveryCheckoutSession): the first card declined and the
  // customer is here to try another one. Treating it as terminal would show
  // "already handled" on the exact page we asked them to open.
  const isTerminal = isTerminalStatus(initialIntentStatus) && session.status !== "open";

  const { data: accounts, error: accErr } = await supabase
    .schema("payments")
    .from("org_provider_accounts")
    .select("provider_id, status, providers:provider_id(id, display_name, is_active)")
    .eq("org_id", session.org_id)
    .eq("environment", env)
    .eq("status", "active");

  if (accErr) throw accErr;

  // Subscriptions are Atmos-only: the first charge binds the card (one OTP) and
  // every renewal reuses that token off-session, so Uzum is never offered here.
  // Detect via the subscription_id stamped on the session — not the order_id
  // heuristic below, which would also sweep in one-off payment links.
  const sessionMetadata = ((session as any).metadata ?? {}) as Record<string, unknown>;
  const isSubscriptionSession =
    typeof sessionMetadata.subscription_id === "string" &&
    sessionMetadata.subscription_id.length > 0;

  const providers =
    (accounts ?? [])
      .filter((a: any) => a.providers?.is_active)
      .filter((a: any) =>
        a.provider_id === "atmos" ||
        (!isSubscriptionSession && a.provider_id === "uzum"),
      )
      .map((a: any) => ({
        id: a.provider_id as string,
        name: a.providers.display_name as string,
      })) ?? [];

  // Atmos collects the card inline, so show the card fields up front — no extra
  // "choose payment method" click. Any redirect providers drop below as alts.
  const atmosProvider = providers.find((p) => p.id === "atmos");
  const otherProviders = providers.filter((p) => p.id !== "atmos");
  const amountMinor = intent?.amount_minor ?? 0;
  const currency = intent?.currency ?? "UZS";
  // Storefront one-off order payments link an order_id → "Payment complete"
  // copy; subscription billing has none → "Your subscription is active".
  const payMode: "subscription" | "payment" = (intent as any)?.order_id
    ? "payment"
    : "subscription";

  return (
    <PayLocaleProvider locale={locale}>
    <div className="mx-auto flex min-h-dvh max-w-md flex-col px-6 py-10">
      <header>
        <BrandWordmark text="Krafta•Pay" className="text-lg" />
      </header>

      <main className="mt-12 flex-1">
        {/* Amount — the focal point. Typography does the work, not a box. */}
        <div className="text-sm text-muted-foreground">{t("checkout.amountDue")}</div>
        {/* Scales down on narrow screens so large UZS sums (millions) stay on
            one line — no orphaned "UZS". */}
        <div className="mt-1 font-mono text-[clamp(1.875rem,7vw,2.75rem)] font-semibold leading-none tracking-tight tabular-nums">
          {intent ? formatMinorAmount(intent.amount_minor, intent.currency) : "—"}
        </div>
        {intent?.description ? (
          <div className="mt-2.5 text-sm text-muted-foreground">{intent.description}</div>
        ) : null}

        <div className="my-8 h-px bg-border" />

        {/* Payment action */}
        <section>
          <h2 className="text-sm font-medium">{t("checkout.paymentDetails")}</h2>

          {isTerminal ? (
            <p className="mt-3 text-sm text-muted-foreground">
              {t("checkout.closed")}
            </p>
          ) : providers.length === 0 ? (
            <p className="mt-3 text-sm text-muted-foreground">
              {t("checkout.noProviders")}
            </p>
          ) : atmosProvider ? (
            <div className="mt-4">
              <AtmosCardForm
                publicToken={public_token}
                amountMinor={amountMinor}
                currency={currency}
                mode={payMode}
              />
              {otherProviders.length > 0 ? (
                <div className="mt-8 border-t pt-6">
                  <div className="text-xs text-muted-foreground">{t("checkout.otherWays")}</div>
                  <ProviderPicker
                    publicToken={public_token}
                    providers={otherProviders}
                    amountMinor={amountMinor}
                    currency={currency}
                  />
                </div>
              ) : null}
            </div>
          ) : (
            <ProviderPicker
              publicToken={public_token}
              providers={providers}
              amountMinor={amountMinor}
              currency={currency}
            />
          )}
        </section>

        {/* Live status — renders only once a payment is actually in flight. */}
        <CheckoutStatusWatcher
          publicToken={public_token}
          isRecoverable={session.status === "open"}
          initial={{
            checkoutSession: {
              id: session.id,
              publicToken: session.public_token,
              status: session.status,
              selectedProviderId: (session as any).selected_provider_id,
              selectedAttemptId: (session as any).selected_attempt_id,
              successUrl: (session as any).success_url,
              cancelUrl: (session as any).cancel_url,
              returnUrl: (session as any).return_url,
              updatedAt: (session as any).updated_at,
            },
            paymentIntent: intent
              ? {
                  status: intent.status,
                  amountMinor: intent.amount_minor,
                  currency: intent.currency,
                  description: intent.description,
                  updatedAt: intent.updated_at,
                }
              : null,
            selectedAttempt: null,
          }}
        />
      </main>

      <footer className="mt-12 flex items-center gap-1 text-xs text-muted-foreground">
        <span>{t("checkout.poweredBy")}</span>
        <BrandWordmark text="Krafta•Pay" className="text-xs" />
      </footer>
    </div>
    </PayLocaleProvider>
  );
}
