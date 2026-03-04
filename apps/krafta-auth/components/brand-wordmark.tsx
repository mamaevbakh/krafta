import * as React from "react";
import { cn } from "@/lib/utils";

type BrandWordmarkProps = React.HTMLAttributes<HTMLSpanElement> & {
  text?: string;
};

export function BrandWordmark({
  text = "Krafta",
  className,
  ...props
}: BrandWordmarkProps) {
  return (
    <span
      className={cn(
        "font-brand font-semibold tracking-tight",
        "text-black dark:text-white",
        className,
      )}
      {...props}
    >
      {text}
    </span>
  );
}
