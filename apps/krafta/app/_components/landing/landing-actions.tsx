/**
 * landing-actions.tsx — the primary call-to-action pair, auth-aware.
 *
 * Signed-out visitor → "Create your shop" (→ /onboarding, the no-signup-wall
 * draft-shop wizard) + "View demo". Signed-in returning visitor → "Open
 * dashboard" + "View demo". Labels come from the active-locale content.
 *
 * Server-safe (plain Links + Button asChild) so it streams with the page.
 */

import Link from "next/link";
import { Button } from "@/components/ui/button";
import type { LandingContent } from "./content";

export const DEMO_HREF = "/vintage-shop";
export const ONBOARDING_HREF = "/onboarding";
export const DASHBOARD_HREF = "/dashboard";
export const SIGN_IN_HREF = {
  pathname: "/auth/sso/start",
  query: { next: "/dashboard" },
} as const;

type LandingActionsProps = {
  authed: boolean;
  content: LandingContent;
  size?: "default" | "lg";
  className?: string;
};

export function LandingActions({
  authed,
  content,
  size = "lg",
  className,
}: LandingActionsProps) {
  const { actions } = content;
  return (
    <div className={className}>
      <Button asChild size={size} variant="default">
        <Link href={authed ? DASHBOARD_HREF : ONBOARDING_HREF}>
          {authed ? actions.dashboard : actions.createShop}
        </Link>
      </Button>
      <Button asChild size={size} variant="outline">
        <Link href={DEMO_HREF}>{actions.viewDemo}</Link>
      </Button>
    </div>
  );
}
