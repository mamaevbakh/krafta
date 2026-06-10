// KRA-42 / ADR 0005 §2 — onboarding entry. Resume rule (D5): a session that
// already owns a shop skips the wizard and lands straight in the Studio; the
// RPC-level idempotency backs this up even if two tabs race past the check.

import { redirect } from "next/navigation";

import { BrandWordmark } from "@/components/brand/brand-wordmark";
import { findOwnedShop } from "@/lib/auth/merchant-shop";

import { OnboardingWizard } from "./_components/onboarding-wizard";

export const metadata = { title: "Create your shop — Krafta" };

export default async function OnboardingPage() {
  const existing = await findOwnedShop();
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
