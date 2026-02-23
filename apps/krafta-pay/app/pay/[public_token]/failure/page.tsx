import { notFound } from "next/navigation";
import { createAdminSupabase } from "@/lib/supabase-admin";
import { PayResultRedirect } from "../result-redirect.client";

export default async function PayFailurePage({
  params,
}: {
  params: Promise<{ public_token: string }>;
}) {
  const { public_token } = await params;
  const supabase = createAdminSupabase();

  const { data: session, error } = await supabase
    .schema("payments")
    .from("checkout_sessions")
    .select("public_token, success_url, cancel_url, return_url")
    .eq("public_token", public_token)
    .maybeSingle();

  if (error) throw error;
  if (!session) notFound();

  return (
    <PayResultRedirect
      publicToken={public_token}
      mode="failure"
      merchantSuccessUrl={(session as any).success_url ?? null}
      merchantCancelUrl={(session as any).cancel_url ?? null}
      merchantReturnUrl={(session as any).return_url ?? null}
    />
  );
}
