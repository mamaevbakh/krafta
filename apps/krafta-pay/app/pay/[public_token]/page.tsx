import { createAdminSupabase } from "@/lib/supabase-admin";
import { notFound } from "next/navigation";
import { BrandWordmark } from "@/components/brand/brand-wordmark";
import { ProviderPicker } from "./provider-picker.client";
import { AtmosCardForm } from "./atmos-card-form.client";
import { CheckoutStatusWatcher } from "./checkout-status.client";
import { PayerDetails } from "./payer-details.client";
import { formatMinorAmount } from "@/lib/format";
import { getCheckoutT } from "@/lib/locales/checkout";
import { TestModeBanner } from "./test-mode-banner";
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
      // `customer_id` decides whether we still need to ask the payer who they
      // are; see the PayerDetails block below.
      "id, status, org_id, public_token, payment_intent_id, customer_id, customer_details, selected_provider_id, selected_attempt_id, success_url, cancel_url, return_url, updated_at, metadata, environment, payment_intents:payment_intent_id(amount_minor, currency, description, status, updated_at, order_id)"
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

  // Both providers can take a subscription's first charge. Atmos binds the card
  // inline (one OTP); Uzum binds on its own page and the bindingId arrives on
  // the webhook, which then runs merchantPay. Renewals reuse the saved token
  // off-session either way — chargeRenewal has always accepted both.
  const providers =
    (accounts ?? [])
      .filter((a: any) => a.providers?.is_active)
      .filter((a: any) => a.provider_id === "atmos" || a.provider_id === "uzum")
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
  // What the customer is told they just bought.
  //
  // This used to key off `order_id`: storefront orders carry one, subscriptions
  // do not. That held while those were the only two callers. Payment links from
  // the dashboard and from POST /api/checkout_sessions are a third kind — no
  // order_id and no subscription — so they fell through to the subscription
  // branch and told a one-off buyer "Your subscription is active", alongside a
  // hint about saving their card for future charges. Neither is true, and on a
  // payment screen an untrue reassurance is the worst kind.
  //
  // The reliable discriminator is whether the intent is attached to a
  // subscription at all, which is the same check `atmos-reconcile` makes when
  // it decides between dunning and a standalone failure.
  const { data: intentInvoice, error: intentInvoiceErr } = await supabase
    .schema("payments")
    .from("invoices")
    .select("subscription_id")
    .eq("payment_intent_id", session.payment_intent_id)
    .not("subscription_id", "is", null)
    .limit(1)
    .maybeSingle();
  if (intentInvoiceErr) throw intentInvoiceErr;

  const payMode: "subscription" | "payment" = intentInvoice ? "subscription" : "payment";

  // Ask who is paying only when nobody has said yet.
  //
  // A merchant who created this link from the customer's own page already typed
  // the name, and asking that person to identify themselves again reads as a
  // system that was not paying attention.
  //
  // A one-off payment link has no customer at all — by design, because Stripe
  // creates one at confirmation and so do we. There the answer lands on the
  // session, and this is the only chance anyone gets to ask: without it a paid
  // link produces money from a stranger.
  //
  // Read here rather than in the client so the fields never appear and then
  // vanish, and so the "empty only" rule is decided by the database — the same
  // rule the write endpoint enforces.
  let askPayer = false;
  if (session.status === "open" && !isTerminal) {
    if (session.customer_id) {
      const { data: payer, error: payerErr } = await supabase
        .schema("payments")
        .from("customers")
        .select("name, phone")
        .eq("id", session.customer_id)
        .maybeSingle();
      if (payerErr) throw payerErr;
      askPayer = Boolean(payer) && !payer?.name && !payer?.phone;
    } else {
      const details = ((session as { customer_details?: unknown }).customer_details ?? {}) as
        Record<string, unknown>;
      askPayer = !details.name && !details.phone;
    }
  }

  return (
    <PayLocaleProvider locale={locale}>
    <div className="mx-auto flex min-h-dvh max-w-md flex-col px-6 py-10">
      <header>
        <BrandWordmark text="Krafta•Pay" className="text-lg" />
      </header>

      <main className="mt-12 flex-1">
        {/* Only in test. Live shows nothing — a real customer paying real money
            should see the amount and the card fields, not our plumbing. */}
        {env === "test" ? (
          <TestModeBanner t={t} locale={locale} publicToken={public_token} />
        ) : null}
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

        {/* Above the card, like Stripe's email field — it is the first thing a
            form asks and the last thing anyone wants to meet after typing a
            card number. Nothing here blocks the payment. */}
        {askPayer ? (
          <>
            <PayerDetails publicToken={public_token} />
            <div className="my-8 h-px bg-border" />
          </>
        ) : null}

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
