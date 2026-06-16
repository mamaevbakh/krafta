import { createAdminSupabase } from "@/lib/supabase-admin";
import { notFound } from "next/navigation";
import { BrandWordmark } from "@/components/brand/brand-wordmark";
import { ProviderPicker } from "./provider-picker.client";
import { CheckoutStatusWatcher } from "./checkout-status.client";
import { formatMinorAmount } from "@/lib/format";

function isTerminalStatus(status?: string | null) {
  const s = (status ?? "").toLowerCase();
  return s === "succeeded" || s === "failed" || s === "canceled" || s === "cancelled";
}

export default async function PayPage({
  params,
}: {
  params: Promise<{ public_token: string }>;
}) {
  const { public_token } = await params;

  const supabase = createAdminSupabase();
  const env = (process.env.PAY_ENV ?? "live") as "test" | "live";

  const { data: session, error } = await supabase
    .schema("payments")
    .from("checkout_sessions")
    .select(
      "id, status, org_id, public_token, payment_intent_id, selected_provider_id, selected_attempt_id, success_url, cancel_url, return_url, updated_at, payment_intents:payment_intent_id(amount_minor, currency, description, status, updated_at)"
    )
    .eq("public_token", public_token)
    .maybeSingle();

  if (error) throw error;
  if (!session) notFound();

  const intent = (session as any).payment_intents;
  const initialIntentStatus = (intent as any)?.status as string | undefined;
  const isTerminal = isTerminalStatus(initialIntentStatus);

  const { data: accounts, error: accErr } = await supabase
    .schema("payments")
    .from("org_provider_accounts")
    .select("provider_id, status, providers:provider_id(id, display_name, is_active)")
    .eq("org_id", session.org_id)
    .eq("environment", env)
    .eq("status", "active");

  if (accErr) throw accErr;

  const providers =
    (accounts ?? [])
      .filter((a: any) => a.providers?.is_active)
      .filter((a: any) => a.provider_id === "uzum" || a.provider_id === "atmos")
      .map((a: any) => ({
        id: a.provider_id as string,
        name: a.providers.display_name as string,
      })) ?? [];

  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col px-6 py-10">
      <header>
        <BrandWordmark text="Krafta•Pay" className="text-lg" />
      </header>

      <main className="mt-12 flex-1">
        {/* Amount — the focal point. Typography does the work, not a box. */}
        <div className="text-sm text-muted-foreground">Amount due</div>
        <div className="mt-1 font-mono text-[2.5rem] font-semibold leading-none tracking-tight tabular-nums">
          {intent ? formatMinorAmount(intent.amount_minor, intent.currency) : "—"}
        </div>
        {intent?.description ? (
          <div className="mt-2.5 text-sm text-muted-foreground">{intent.description}</div>
        ) : null}

        <div className="my-8 h-px bg-border" />

        {/* Payment action */}
        <section>
          <h2 className="text-sm font-medium">Payment method</h2>

          {isTerminal ? (
            <p className="mt-3 text-sm text-muted-foreground">
              This checkout is no longer accepting payments.
            </p>
          ) : providers.length > 0 ? (
            <ProviderPicker
              publicToken={public_token}
              providers={providers}
              amountMinor={intent?.amount_minor ?? 0}
              currency={intent?.currency ?? "UZS"}
            />
          ) : (
            <p className="mt-3 text-sm text-muted-foreground">
              No payment methods are configured for this merchant yet.
            </p>
          )}
        </section>

        {/* Live status — renders only once a payment is actually in flight. */}
        <CheckoutStatusWatcher
          publicToken={public_token}
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
        <span>Powered by</span>
        <BrandWordmark text="Krafta•Pay" className="text-xs" />
      </footer>
    </div>
  );
}
