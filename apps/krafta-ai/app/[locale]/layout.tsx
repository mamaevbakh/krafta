import { notFound } from "next/navigation"

import { Toaster } from "@/components/ui/sonner"
import { LOCALES, isLocale } from "@/lib/i18n"

export function generateStaticParams() {
  return LOCALES.map((locale) => ({ locale }))
}

/**
 * Locale gate only. The console shell (sidebar, org switcher) lives in the
 * `(console)` route group so signed-out pages like /sign-in don't render
 * inside a navigation chrome they can't use.
 */
export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: Promise<{ locale: string }>
}) {
  const { locale } = await params
  if (!isLocale(locale)) notFound()

  return (
    <>
      {children}
      <Toaster />
    </>
  )
}
