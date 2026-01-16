"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminSupabase } from "@/lib/supabase-admin";
import { createCheckoutSession } from "@krafta/payments-core";

export async function createHostedCheckoutAction(formData: FormData) {
  const orgId = String(formData.get("orgId") ?? "").trim();
  const amountMinor = Number(formData.get("amountMinor") ?? 0);
  const currency = String(formData.get("currency") ?? "UZS").trim();
  const description = String(formData.get("description") ?? "").trim();

  const payBaseUrl = process.env.PAY_BASE_URL;
  if (!payBaseUrl) {
    redirect(`/dashboard?error=${encodeURIComponent("PAY_BASE_URL is not set")}`);
  }

  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) {
    redirect("/login?next=/dashboard");
  }

  // Access control: user must belong to org.
  const { data: membership } = await supabase
    .from("organization_members")
    .select("id")
    .eq("org_id", orgId)
    .eq("user_id", auth.user.id)
    .maybeSingle();

  if (!membership) {
    redirect(`/dashboard?error=${encodeURIComponent("You do not have access to this org")}`);
  }

  const admin = createAdminSupabase();

  const result = await createCheckoutSession(
    admin,
    {
      orgId,
      amountMinor,
      currency,
      description,
      // Dummy https URLs are fine for provider validation during dev.
      successUrl: "https://pay.krafta.uz/pay/success",
      cancelUrl: "https://pay.krafta.uz/pay/cancel",
      // Uzum terminals can have AUTOFISCALIZATION enabled; in that case
      // /payment/register requires a cart with fiscalization params.
      // For now we attach a demo cart so hosted checkout works end-to-end.
      metadata: {
        uzumCart: {
          cartId: `demo-cart-${Date.now()}`,
          receiptType: "PURCHASE",
          total: amountMinor,
          items: [
            {
              title: description || "Hosted checkout",
              productId: "demo-1",
              quantity: 1,
              unitPrice: amountMinor,
              total: amountMinor,
              receiptParams: {
                // Use a real IKPU (IKPU/SPIC) value; required length is 17.
                spic: "10305008003000000",
                // Must be numeric; many IKPUs have no package codes. In practice
                // use a valid code from tasnif.soliq.uz for your product.
                packageCode: "1546532",
                vatPercent: 0,
                // Required by Uzum validator: provide either TIN or PINFL.
                TIN: "123456789",
              },
            },
          ],
        },
      },
    },
    payBaseUrl,
  );

  redirect(
    `/dashboard?publicToken=${encodeURIComponent(result.publicToken)}&payUrl=${encodeURIComponent(
      result.payUrl,
    )}`,
  );
}
