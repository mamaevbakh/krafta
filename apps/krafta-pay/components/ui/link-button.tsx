"use client";

import type { ComponentProps } from "react";
import Link from "next/link";
import type { VariantProps } from "class-variance-authority";
import { buttonVariants } from "@/components/ui/button";

// A button-styled <Link>. buttonVariants() lives in a "use client" module, so it
// can't be called from a Server Component — this client wrapper renders it safely
// for server pages that need a link styled as a button.
export function LinkButton({
  className,
  variant,
  size,
  ...props
}: ComponentProps<typeof Link> & VariantProps<typeof buttonVariants>) {
  return <Link className={buttonVariants({ variant, size, className })} {...props} />;
}
