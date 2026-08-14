import * as React from "react"

import { cn } from "@/lib/utils"

type BrandWordmarkProps = React.HTMLAttributes<HTMLSpanElement> & {
  text?: string
}

/**
 * The ONLY place Helvetica Neue Bold is allowed. "Krafta", "Krafta AI",
 * "Krafta Pay" — the brand always renders through this component so the
 * wordmark can never drift into Geist on one screen and Helvetica on another.
 */
export function BrandWordmark({
  text = "Krafta AI",
  className,
  ...props
}: BrandWordmarkProps) {
  return (
    <span
      className={cn(
        "font-brand font-semibold tracking-tight",
        "text-black dark:text-white",
        className
      )}
      {...props}
    >
      {text}
    </span>
  )
}
