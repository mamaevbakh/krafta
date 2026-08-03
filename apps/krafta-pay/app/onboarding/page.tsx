import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { BrandWordmark } from "@/components/brand/brand-wordmark";
import { createClient } from "@/lib/supabase/server";
import { getUserSafely } from "@krafta/supabase/auth";
import { buildKraftaLoginUrl, getRequestOrigin } from "@/lib/auth-redirect";
import { createAdminSupabase } from "@/lib/supabase-admin";
import { findOnboardedOrg } from "@/lib/onboarding-status";
import { OnboardingWizard } from "./_components/onboarding-wizard.client";

export const metadata = {
  title: "Set up Krafta Pay",
  robots: { index: false },
};

export default async function OnboardingPage() {
  const supabase = await createClient();
  const { user, authError } = await getUserSafely(supabase);

  if (authError || !user) {
    const origin = getRequestOrigin(await headers());
    redirect(buildKraftaLoginUrl(`${origin}/onboarding`));
  }

  // Resume rule, same as Krafta's wizard: a session that already finished setup
  // goes straight to its dashboard rather than being asked again.
  const existing = await findOnboardedOrg(createAdminSupabase(), user.id);
  if (existing) {
    redirect(`/dashboard/org/${existing.orgSlug}`);
  }

  return (
    <main className="min-h-dvh bg-background">
      <div className="mx-auto flex w-full max-w-md flex-col px-6 py-10 sm:py-16">
        <BrandWordmark text="Krafta•Pay" className="text-xl" />
        <div className="mt-10">
          <OnboardingWizard />
        </div>
      </div>
    </main>
  );
}
