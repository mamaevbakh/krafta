"use client";

import type { ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";

/**
 * SubmitButton — a form submit button that disables itself while the enclosing
 * server-action form is pending. This is what stops a double-click (or an
 * impatient triple-click) from firing two checkout / retry requests before the
 * first navigates away. The server-side resume logic already dedupes sequential
 * re-clicks; this closes the same-tab, same-instant double-fire.
 *
 * Must be rendered INSIDE a <form action={...}> — useFormStatus reads the
 * pending state of the nearest parent form.
 */
export function SubmitButton({
  children,
  variant = "default",
  className,
  disabled,
}: {
  children: ReactNode;
  variant?: React.ComponentProps<typeof Button>["variant"];
  className?: string;
  disabled?: boolean;
}) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant={variant} className={className} disabled={disabled || pending}>
      {pending ? <Loader2 className="size-4 animate-spin" /> : null}
      {children}
    </Button>
  );
}
