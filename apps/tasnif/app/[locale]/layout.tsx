import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { GeistMono } from "geist/font/mono"
import { GeistSans } from "geist/font/sans"

import { TooltipProvider } from "@/components/ui/tooltip"
import { LOCALES, dictionary, isLocale } from "@/lib/i18n"

import "../globals.css"

export function generateStaticParams() {
  return LOCALES.map((locale) => ({ locale }))
}

export async function generateMetadata({ params }: LayoutProps<"/[locale]">): Promise<Metadata> {
  const { locale } = await params
  if (!isLocale(locale)) return {}
  const t = dictionary(locale)
  return {
    title: t.meta.title,
    description: t.meta.description,
    // Not launched. A half-built page indexed under krafta.uz would teach search
    // engines the wrong snippet; lift at launch.
    robots: { index: false, follow: false },
  }
}

/** The root layout lives under [locale] so <html lang> is always the page's real language. */
export default async function LocaleLayout({ children, params }: LayoutProps<"/[locale]">) {
  const { locale } = await params
  if (!isLocale(locale)) notFound()

  return (
    <html lang={locale === "uz" ? "uz-Latn" : locale}>
      <body className={`${GeistSans.variable} ${GeistMono.variable} font-sans antialiased`}>
        <TooltipProvider>{children}</TooltipProvider>
      </body>
    </html>
  )
}
