// KRA-42 / ADR 0005 §2 — onboarding entry. Resume rule (D5): a session that
// already owns a shop skips the wizard and lands straight in the Studio; the
// RPC-level idempotency backs this up even if two tabs race past the check.

import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { BrandWordmark } from "@/components/brand/brand-wordmark";
import { findOwnedShop } from "@/lib/auth/merchant-shop";

import { OnboardingWizard } from "./_components/onboarding-wizard";

export const metadata = { title: "Create your shop — Krafta" };

export default async function OnboardingPage() {
  // The resume redirect must NOT fire during a server-action POST: the
  // wizard's own submit sets auth cookies (anon sign-in), which makes Next
  // re-render this page inside the action response — redirecting there
  // would yank the merchant off the reveal screen the moment their shop
  // exists. Action requests carry the Next-Action header; plain
  // navigations don't. (If this header ever changes name upstream, the
  // wow-path e2e fails on the reveal step — that's the canary.)
  const isServerAction = (await headers()).has("next-action");
  const existing = isServerAction ? null : await findOwnedShop();
  if (existing) {
    redirect(`/dashboard/${existing.orgSlug}/${existing.catalogSlug}/items`);
  }

  return (
    <main className="min-h-dvh bg-background">
      <div className="mx-auto flex w-full max-w-md flex-col px-6 py-10 sm:py-16">
        <BrandWordmark className="text-xl" />
        <div className="mt-10">
          <OnboardingWizard />
        </div>
      </div>
    </main>
  );
}
