import * as React from "react"

import { cn } from "@/lib/utils"

function Input({
  className,
  type,
  ...props
}: React.ComponentProps<"input">) {
  return (
    <input
      data-slot="input"
      type={type}
      className={cn(
        // text-base (16px) on mobile, md:text-sm (14px) on desktop: keeping
        // the font ≥16px on phones stops iOS Safari from zooming the viewport
        // when the field is focused (the global floor in globals.css is the
        // catch-all; this keeps the primitive correct on its own).
        "border-input file:text-foreground placeholder:text-muted-foreground selection:bg-primary selection:text-primary-foreground flex h-9 w-full min-w-0 rounded-md border bg-transparent px-3 py-1 text-base shadow-xs transition-colors file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium disabled:pointer-events-none disabled:opacity-50 focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] outline-none md:text-sm",
        className
      )}
      {...props}
    />
  )
}

export { Input }
