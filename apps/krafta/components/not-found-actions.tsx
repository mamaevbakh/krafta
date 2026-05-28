"use client";

import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { SignOutButton } from "@/components/auth/sign-out-button";

export function NotFoundActions({ isAuthed }: { isAuthed: boolean }) {
  const router = useRouter();
  const fallbackHref = isAuthed ? "/dashboard" : "/";

  const goBack = () => {
    if (typeof window !== "undefined" && window.history.length > 1) {
      router.back();
      return;
    }
    router.push(fallbackHref);
  };

  return (
    <div className="flex flex-col items-center gap-3">
      <Button onClick={goBack} variant="outline" className="rounded-full px-6">
        Go back
      </Button>
      {/* Sign-out escape hatch — exists so a customer / merchant
       *  who landed here with a stale anon Supabase session (or any
       *  signed-in state they didn't intend) can clear it and sign
       *  back in. Will be replaced by the onboarding redirect once
       *  the new-user flow lands. */}
      {isAuthed ? (
        <SignOutButton
          variant="ghost"
          size="sm"
          className="text-muted-foreground"
        />
      ) : null}
    </div>
  );
}

