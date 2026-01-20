import { createAdminSupabase } from "@/lib/supabase-admin";
import { notFound } from "next/navigation";
import { BrandWordmark } from "@/components/brand/brand-wordmark";
import { ProviderPicker } from "./provider-picker.client";
import { CheckoutStatusWatcher } from "./checkout-status.client";

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
      .map((a: any) => ({
        id: a.provider_id as string,
        name: a.providers.display_name as string,
      })) ?? [];

  return (
    <div className="mx-auto max-w-md p-6">
        <BrandWordmark text="Krafta.Pay" className="mb-6 text-3xl text-center w-full" />
      

      <div className="mt-4 rounded-lg border p-4">
        <div className="text-sm text-muted-foreground">Amount</div>
        <div className="text-2xl font-semibold">
          {intent?.amount_minor} {intent?.currency}
        </div>
        {intent?.description ? (
          <div className="mt-2 text-sm text-muted-foreground">{intent.description}</div>
        ) : null}
      </div>

      <div className="mt-4">
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
      </div>

      <div className="mt-6">
        <div className="text-sm font-medium">Payment methods</div>

        {!isTerminal ? (
          <ProviderPicker publicToken={public_token} providers={providers} />
        ) : (
          <div className="mt-3 text-sm text-muted-foreground">
            This checkout session is no longer accepting new payments.
          </div>
        )}

        {providers.length === 0 ? (
          <div className="mt-4 text-sm text-red-600">
            No providers configured for this merchant.
          </div>
        ) : null}
      </div>

      <div className="mt-6 flex gap-1 text-xs text-muted-foreground items-center justify-center">
        <span>Powered by</span>
        <BrandWordmark text="Krafta.Pay" className="text-xs" />
      </div>
    </div>
  );
}
