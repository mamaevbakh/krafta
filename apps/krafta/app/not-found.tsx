import { BrandWordmark } from "@/components/brand/brand-wordmark";
import { createClient } from "@/lib/supabase/server";
import { getUserSafely } from "@krafta/supabase/auth";
import { NotFoundActions } from "@/components/not-found-actions";

export default async function NotFound() {
  const supabase = await createClient();
  const { user } = await getUserSafely(supabase);

  return (
    <main className="min-h-svh bg-secondary-background px-6">
      <div className="mx-auto flex w-full max-w-3xl flex-col items-center justify-center py-16 text-center">
        <BrandWordmark className="text-4xl" />

        <div className="mt-10">
          <p className="text-sm font-medium text-muted-foreground">Not Found</p>
          <h1 className="mt-3 text-6xl font-semibold tracking-tight">404</h1>
          <p className="mt-4 text-sm text-muted-foreground">
            The page you’re looking for doesn’t exist or you don’t have access.
          </p>
        </div>

        <div className="mt-8">
          <NotFoundActions isAuthed={Boolean(user)} />
        </div>
      </div>
    </main>
  );
}
