import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { GeistMono } from "geist/font/mono"
import { GeistSans } from "geist/font/sans"

import { SiteFooter, SiteHeader } from "@/components/site-chrome"
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

/**
 * The root layout lives under [locale] so <html lang> is always the page's real
 * language. It also carries the header and footer, so they are part of every
 * page's static shell, even on a code page whose content streams in.
 */
export default async function LocaleLayout({ children, params }: LayoutProps<"/[locale]">) {
  const { locale } = await params
  if (!isLocale(locale)) notFound()
  const t = dictionary(locale)

  return (
    <html lang={locale === "uz" ? "uz-Latn" : locale}>
      <body className={`${GeistSans.variable} ${GeistMono.variable} font-sans antialiased`}>
        <TooltipProvider>
          <div className="flex min-h-dvh flex-col">
            <SiteHeader locale={locale} t={t} />
            {children}
            <SiteFooter locale={locale} t={t} />
          </div>
        </TooltipProvider>
      </body>
    </html>
  )
}
