import { notFound } from "next/navigation";
import { createAdminSupabase } from "@/lib/supabase-admin";
import { writePaymentDebugLog } from "@krafta/payments-core";
import { PayResultRedirect } from "../result-redirect.client";
import { resolveCheckoutLocaleByToken } from "@/lib/locales/checkout";
import { TestModeBanner } from "../test-mode-banner";
import { PayLocaleProvider } from "@/lib/locales/context";

export default async function PayFailurePage({
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
    .select("public_token, success_url, cancel_url, return_url, metadata, environment")
    .eq("public_token", public_token)
    .maybeSingle();

  if (error) throw error;
  if (!session) notFound();

  await writePaymentDebugLog(supabase, {
    scope: "callback_page",
    event: "failure.hit",
    providerId: "uzum",
    publicToken: public_token,
    data: {
      merchantSuccessUrl: (session as any).success_url ?? null,
      merchantCancelUrl: (session as any).cancel_url ?? null,
      merchantReturnUrl: (session as any).return_url ?? null,
    },
  });

  // Same locale the customer just paid in — read back off the session rather
  // than re-deriving from Accept-Language, which would contradict an explicit
  // ?lang= or a merchant-set session locale on the page right before this one.
  const { locale, t } = await resolveCheckoutLocaleByToken(supabase, public_token, sp.lang);
  const isTest = (session as { environment?: string }).environment === "test";

  return (
    <PayLocaleProvider locale={locale}>
    {isTest ? (
      <div className="mx-auto w-full max-w-md px-6 pt-10 [&>*]:mb-0">
        <TestModeBanner t={t} />
      </div>
    ) : null}
    <PayResultRedirect
      publicToken={public_token}
      mode="failure"
      merchantSuccessUrl={(session as any).success_url ?? null}
      merchantCancelUrl={(session as any).cancel_url ?? null}
      merchantReturnUrl={(session as any).return_url ?? null}
    />
    </PayLocaleProvider>
  );
}
