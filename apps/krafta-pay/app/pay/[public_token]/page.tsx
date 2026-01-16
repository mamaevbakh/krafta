import { createAdminSupabase } from "@/lib/supabase-admin";
import { notFound } from "next/navigation";
import { BrandWordmark } from "@/components/brand/brand-wordmark";

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
      "id, status, org_id, public_token, payment_intent_id, payment_intents:payment_intent_id(amount_minor, currency, description)"
    )
    .eq("public_token", public_token)
    .maybeSingle();

  if (error) throw error;
  if (!session) notFound();

  const intent = (session as any).payment_intents;

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

      <div className="mt-6">
        <div className="text-sm font-medium">Payment methods</div>

        <div className="mt-3 space-y-2">
          {providers.map((p) => (
            <form
              key={p.id}
              action={`/pay/${public_token}/select?provider=${encodeURIComponent(p.id)}`}
              method="post"
            >
              <button
                type="submit"
                className="w-full rounded-md border px-4 py-3 text-left hover:bg-muted"
              >
                {p.name}
              </button>
            </form>
          ))}
        </div>

        {providers.length === 0 ? (
          <div className="mt-4 text-sm text-red-600">
            No providers configured for this merchant.
          </div>
        ) : null}
      </div>

      <div className="mt-6 flex items-center gap-1 text-xs text-muted-foreground">
        <span>Powered by</span>
        <BrandWordmark text="Krafta.Pay" className="text-xs" />
      </div>
    </div>
  );
}
