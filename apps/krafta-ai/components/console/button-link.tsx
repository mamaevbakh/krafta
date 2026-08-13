import Link from "next/link"

import { Button } from "@/components/ui/button"

/**
 * shadcn's Button is Base UI's ButtonPrimitive, which asserts a native
 * <button> unless you tell it otherwise. Rendering a Next <Link> through it
 * without `nativeButton={false}` logs an accessibility warning on every render.
 *
 * This is the one composition we repeat on every screen, so it lives here
 * rather than being re-derived (and re-forgotten) at each call site.
 */
export function ButtonLink({
  href,
  children,
  ...props
}: React.ComponentProps<typeof Button> & { href: string }) {
  return (
    <Button nativeButton={false} render={<Link href={href} />} {...props}>
      {children}
    </Button>
  )
}
