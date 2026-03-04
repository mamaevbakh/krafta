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

  return (
    <Button asChild variant="outline">
      <Link
        href={
          user
            ? "/dashboard"
            : { pathname: "/auth/sso/start", query: { next: "/dashboard" } }
        }
      >
        {user ? "View Dashboard" : "Sign In"}
      </Link>
    </Button>
  );
}
