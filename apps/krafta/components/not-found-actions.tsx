"use client";

import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

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
    <Button onClick={goBack} variant="outline" className="rounded-full px-6">
      Go back
    </Button>
  );
}

