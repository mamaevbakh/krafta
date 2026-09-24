import { Suspense } from "react"
import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"

import { SearchExperience, SearchFallback } from "@/components/search/search-experience"
import { dictionary, isLocale, type Dictionary, type Locale } from "@/lib/i18n"
import { jsonLd, pageMetadata, SITE_NAME, SITE_URL } from "@/lib/site"

export async function generateMetadata({ params }: PageProps<"/[locale]">): Promise<Metadata> {
  const { locale } = await params
  if (!isLocale(locale)) return {}
  const t = dictionary(locale)
  return pageMetadata({ locale, title: { absolute: t.meta.title }, description: t.meta.description })
}

export default async function SearchPage({ params }: PageProps<"/[locale]">) {
  const { locale } = await params
  if (!isLocale(locale)) notFound()
  const t = dictionary(locale)

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 pt-10 pb-16 sm:px-6 sm:pt-14">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(structuredData(locale, t)) }} />
      <h1 className="text-[32px] leading-tight font-medium tracking-tight text-balance">{t.search.title}</h1>
      <p className="mt-3 max-w-2xl text-base text-pretty text-muted-foreground">{t.search.lead}</p>
      <Suspense fallback={<SearchFallback t={t} />}>
        <SearchExperience locale={locale} t={t} />
      </Suspense>
      <About locale={locale} t={t} />
    </main>
  )
}

/**
 * What an IKPU is and how to find one, in plain words. It answers the questions people
 * type into Google and Yandex ("что такое икпу", "икпу и мхик разница"), which a search box
 * alone gives a search engine nothing to match. Part of the static shell, so it is in the
 * first response for everyone.
 */
function About({ locale, t }: { locale: Locale; t: Dictionary }) {
  return (
    <div className="mt-16 flex flex-col gap-10 border-t pt-10">
      <section aria-labelledby="about-what" className="flex flex-col gap-3">
        <h2 id="about-what" className="text-xl font-medium tracking-tight">
          {t.about.whatTitle}
        </h2>
        <p className="text-base text-pretty text-muted-foreground">{t.about.whatText}</p>
        <p className="text-base text-pretty text-muted-foreground">{t.about.packageText}</p>
      </section>

      <section aria-labelledby="about-how" className="flex flex-col gap-3">
        <h2 id="about-how" className="text-xl font-medium tracking-tight">
          {t.about.howTitle}
        </h2>
        <p className="text-base text-pretty text-muted-foreground">{t.about.howText}</p>
        <p className="text-base text-pretty text-muted-foreground">{t.about.checkText}</p>
        <Link href={`/${locale}/catalog`} className="w-fit text-base underline underline-offset-4 hover:text-muted-foreground">
          {t.catalog.browse}
        </Link>
      </section>

      <section aria-labelledby="about-faq" className="flex flex-col gap-4">
        <h2 id="about-faq" className="text-xl font-medium tracking-tight">
          {t.about.faqTitle}
        </h2>
        <dl className="flex flex-col gap-5">
          {t.about.faq.map((item) => (
            <div key={item.q} className="flex flex-col gap-1">
              <dt className="text-base font-medium">{item.q}</dt>
              <dd className="text-base text-pretty text-muted-foreground">{item.a}</dd>
            </div>
          ))}
        </dl>
      </section>
    </div>
  )
}

/**
 * The site's name for Google's results (WebSite; "Tasnif" rather than the hostname) and the
 * questions above (FAQPage, which Yandex can show as expandable answers). Both describe only
 * what the page visibly says.
 */
function structuredData(locale: Locale, t: Dictionary) {
  return [
    {
      "@context": "https://schema.org",
      "@type": "WebSite",
      name: SITE_NAME,
      alternateName: "tasnif.krafta.uz",
      url: `${SITE_URL}/`,
      inLanguage: locale === "uz" ? "uz-Latn" : locale,
      description: t.meta.description,
      publisher: { "@type": "Organization", name: "Krafta", url: "https://krafta.uz" },
    },
    {
      "@context": "https://schema.org",
      "@type": "FAQPage",
      inLanguage: locale === "uz" ? "uz-Latn" : locale,
      mainEntity: t.about.faq.map((item) => ({
        "@type": "Question",
        name: item.q,
        acceptedAnswer: { "@type": "Answer", text: item.a },
      })),
    },
  ]
}
