import { headers } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getUserSafely } from "@krafta/supabase/auth";
import { BrandWordmark } from "@/components/brand-wordmark";
import { LoginForm } from "@/components/login-form";
import { normalizeNextPath, getRequestOrigin } from "@/lib/auth/redirect";
import { createClient } from "@/lib/supabase/server";
import { telegramOidcConfigured } from "@/lib/telegram/oidc-login";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string | string[] }>;
}) {
  const sp = await searchParams;
  const headersList = await headers();
  const origin = getRequestOrigin(headersList);
  const rawNext = Array.isArray(sp.next) ? sp.next[0] : sp.next;
  const next = normalizeNextPath(rawNext, origin, "/");

  const supabase = await createClient();
  const { user } = await getUserSafely(supabase);
  if (user) {
    redirect(next);
  }

  return (
    <div className="bg-muted flex min-h-svh flex-col items-center justify-center gap-6 p-6 md:p-10">
      <div className="flex w-full max-w-sm flex-col gap-6">
        <Link href="/" className="flex items-center gap-2 self-center font-medium">
          <BrandWordmark className="text-3xl" />
        </Link>
        <LoginForm next={next} telegramEnabled={telegramOidcConfigured()} />
      </div>
    </div>
  );
}
