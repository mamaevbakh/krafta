// app/onboarding/loading.tsx
//
// The onboarding page awaits findOwnedShop() (cookies) at the top level for
// the D5 resume rule, so the segment needs its own Suspense boundary now
// that the root layout no longer provides one (see app/layout.tsx). Same
// centered spinner the old root-level fallback showed.

import { Spinner } from "@/components/ui/spinner";

export default function OnboardingLoading() {
  return (
    <div className="min-h-svh bg-background flex items-center justify-center">
      <Spinner className="size-6 text-muted-foreground" />
    </div>
  );
}
