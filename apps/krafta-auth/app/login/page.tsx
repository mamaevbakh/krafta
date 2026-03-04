import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getUserSafely } from "@krafta/supabase/auth";
import { LoginForm } from "@/components/login-form";
import { normalizeNextPath, getRequestOrigin } from "@/lib/auth/redirect";
import { createClient } from "@/lib/supabase/server";

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
    <main className="mx-auto flex min-h-screen max-w-3xl items-center justify-center px-6 py-12">
      <LoginForm next={next} />
    </main>
  );
}
