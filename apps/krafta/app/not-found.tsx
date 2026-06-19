import { Suspense } from "react";

import { BrandWordmark } from "@/components/brand/brand-wordmark";
import { createClient } from "@/lib/supabase/server";
import { getUserSafely } from "@krafta/supabase/auth";
import { NotFoundActions } from "@/components/not-found-actions";

// The 404 shell is static so notFound() can resolve a real 404 status
// pre-stream. Only the auth probe (cookies) lives behind Suspense — with
// cacheComponents on, request data outside a boundary would fail the
// /_not-found prerender, and there is deliberately no root-level boundary
// (see app/layout.tsx).
export default function NotFound() {
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
          {/* Anonymous variant as the fallback: "Go back" is the primary
              action either way; signed-in visitors get the sign-out escape
              hatch streamed in. */}
          <Suspense fallback={<NotFoundActions isAuthed={false} />}>
            <AuthAwareNotFoundActions />
          </Suspense>
        </div>
      </div>
    </main>
  );
}

async function AuthAwareNotFoundActions() {
  const supabase = await createClient();
  const { user } = await getUserSafely(supabase);
  return <NotFoundActions isAuthed={Boolean(user)} />;
}
