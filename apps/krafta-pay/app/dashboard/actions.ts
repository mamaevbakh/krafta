"use server";

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { createAdminSupabase } from "@/lib/supabase-admin";
import { createCheckoutSession, createSubscriptionCheckout } from "@krafta/payments-core";
import { buildKraftaLoginUrl, getRequestOrigin } from "@/lib/auth-redirect";
import { getUserSafely } from "@krafta/supabase/auth";

async function requireMembership(orgId: string) {
  const supabase = await createClient();
  const { user, authError } = await getUserSafely(supabase);
  if (authError || !user) {
    const origin = getRequestOrigin(await headers());
    redirect(buildKraftaLoginUrl(`${origin}/dashboard`));
  }
  const { data: membership } = await supabase
    .from("organization_members")
    .select("id")
    .eq("org_id", orgId)
    .eq("user_id", user.id)
    .maybeSingle();
  return { user, membership };
}

export async function createHostedCheckoutAction(formData: FormData) {
  const orgId = String(formData.get("orgId") ?? "").trim();
  // The form collects whole UZS (no decimals); intents are stored in tiyin.
  const amountUzs = Number(formData.get("amount") ?? 0);
  // The dashboard is UZS-only for v1 — no currency control on the form.
  const currency = "UZS";
  const description = String(formData.get("description") ?? "").trim();

  if (!Number.isFinite(amountUzs) || amountUzs <= 0) {
    redirect(`/dashboard?error=${encodeURIComponent("Enter an amount greater than zero")}`);
  }
  // step={1} is only a client hint; UZS has no sub-units, so reject fractional
  // sums server-side rather than silently storing 137,000.50.
  if (!Number.isInteger(amountUzs)) {
    redirect(`/dashboard?error=${encodeURIComponent("Enter a whole UZS amount")}`);
  }
  const amountMinor = amountUzs * 100;

  const payBaseUrl = process.env.PAY_BASE_URL;
  if (!payBaseUrl) {
    redirect(`/dashboard?error=${encodeURIComponent("PAY_BASE_URL is not set")}`);
  }

  const supabase = await createClient();
  const { user, authError } = await getUserSafely(supabase);
  if (authError || !user) {
    const origin = getRequestOrigin(await headers());
    redirect(buildKraftaLoginUrl(`${origin}/dashboard`));
  }

  // Access control: user must belong to org.
  const { data: membership } = await supabase
    .from("organization_members")
    .select("id")
    .eq("org_id", orgId)
    .eq("user_id", user.id)
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

export async function createSubscriptionCheckoutAction(formData: FormData) {
  const orgId = String(formData.get("orgId") ?? "").trim();
  const planId = String(formData.get("planId") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim();

  const base = `/dashboard/subscriptions${orgId ? `?orgId=${encodeURIComponent(orgId)}` : ""}`;
  const failWith = (msg: string) =>
    `${base}${base.includes("?") ? "&" : "?"}subError=${encodeURIComponent(msg)}`;

  if (!planId) redirect(failWith("Select a plan"));

  const payBaseUrl = process.env.PAY_BASE_URL;
  if (!payBaseUrl) redirect(failWith("PAY_BASE_URL is not set"));

  const { membership } = await requireMembership(orgId);
  if (!membership) redirect(failWith("You do not have access to this org"));

  const admin = createAdminSupabase();
  let result: Awaited<ReturnType<typeof createSubscriptionCheckout>>;
  try {
    result = await createSubscriptionCheckout(admin, {
      merchantOrgId: orgId,
      // Dashboard-created subscriptions identify the customer by email; the
      // customer record is owned by the merchant org (no external customer org).
      customerOrgId: orgId,
      planId,
      customer: email ? { email } : undefined,
      payBaseUrl,
      successUrl: "https://pay.krafta.uz/pay/success",
      cancelUrl: "https://pay.krafta.uz/pay/cancel",
    });
  } catch (error) {
    redirect(failWith(error instanceof Error ? error.message : "subscription_create_failed"));
  }

  redirect(
    `${base}${base.includes("?") ? "&" : "?"}subPayUrl=${encodeURIComponent(
      result.payUrl,
    )}&subToken=${encodeURIComponent(result.publicToken)}`,
  );
}
