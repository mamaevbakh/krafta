import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/server";
import { getUserSafely } from "@krafta/supabase/auth";
import { Loader2 } from "lucide-react";
import Link from "next/link";

export function HomeAuthCtaFallback() {
  return (
    <Button variant="outline" disabled aria-busy="true">
      <Loader2 className="animate-spin" />
      Checking…
    </Button>
  );
}

export async function HomeAuthCta() {
  const supabase = await createClient();
  const { user } = await getUserSafely(supabase);

  // Signed-in returning visitor: straight to the dashboard.
  // Anonymous from a prior session: same — they already have a shop.
  if (user) {
    return (
      <Button asChild variant="outline">
        <Link href="/dashboard">View Dashboard</Link>
      </Button>
    );
  }

  // First-time visitor: two paths. "Create your shop" opens the 2-screen
  // wizard (KRA-42): vertical + name, then a vertical-seeded draft shop with
  // no signup wall (anon session, ADR 0005 §2). "Sign in" is for returning
  // users who already registered.
  return (
    <>
      <Button asChild variant="default">
        <Link href="/onboarding">Create your shop</Link>
      </Button>
      <Button asChild variant="outline">
        <Link href={{ pathname: "/auth/sso/start", query: { next: "/dashboard" } }}>
          Sign In
        </Link>
      </Button>
    </>
  );
}
