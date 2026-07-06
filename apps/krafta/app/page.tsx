import type { Metadata } from "next";
import { Suspense } from "react";
import { headers } from "next/headers";

import { createClient } from "@/lib/supabase/server";
import { getUserSafely } from "@krafta/supabase/auth";

import {
  getLandingContent,
  isLandingLocale,
  isUzbekistanVisitor,
  LANDING_LOCALES,
  resolveDefaultLandingLocale,
  resolveLandingLocale,
  type LandingLocale,
} from "./_components/landing/content";
import { LandingJsonLd } from "./_components/landing/structured-data";
import { HtmlLangSync } from "./_components/landing/html-lang-sync";
import { LandingNav } from "./_components/landing/landing-nav";
import { LandingHero } from "./_components/landing/landing-hero";
import { LandingProof } from "./_components/landing/landing-proof";
import { LandingProblem } from "./_components/landing/landing-problem";
import { LandingFeatures } from "./_components/landing/landing-features";
import { LandingDashboard } from "./_components/landing/landing-dashboard";
import { LandingChannels } from "./_components/landing/landing-channels";
import { LandingPayments } from "./_components/landing/landing-payments";
import { LandingAi } from "./_components/landing/landing-ai";
import { LandingHow } from "./_components/landing/landing-how";
import { LandingPricing } from "./_components/landing/landing-pricing";
import { LandingFaq } from "./_components/landing/landing-faq";
import { LandingClosing } from "./_components/landing/landing-closing";
import { LandingFooter } from "./_components/landing/landing-footer";

type SearchParams = Promise<{ [key: string]: string | string[] | undefined }>;

// Canonical public host — OG/Twitter cards only matter on the shared prod
// link (Telegram/WhatsApp unfurls), so the image + URLs resolve against prod
// regardless of which environment renders the tag.
const SITE_URL = "https://www.krafta.uz";
const OG_LOCALE: Record<LandingLocale, string> = {
  ru: "ru_RU",
  uz: "uz_UZ",
  en: "en_US",
};

const META: Record<LandingLocale, { title: string; description: string }> = {
  ru: {
    title: "Krafta — витрина, заказы и QR-меню для кафе и магазинов",
    description:
      "Витрина, приём заказов и QR-меню для кафе, ресторанов и магазинов Узбекистана. Зал, самовывоз и доставка — управление с телефона. Без комиссии с продаж.",
  },
  uz: {
    title: "Krafta — kafe va doʻkonlar uchun vitrina, buyurtma va QR-menyu",
    description:
      "Oʻzbekistondagi kafe, restoran va doʻkonlar uchun vitrina, buyurtmalar va QR-menyu — yagona tizimda. Zal, olib ketish va yetkazib berish — telefondan boshqaring. Sotuvdan komissiyasiz.",
  },
  en: {
    title: "Krafta — online storefront, orders & QR menu for local shops",
    description:
      "Storefront, orders, and QR menu in one system for cafes, restaurants, and shops in Uzbekistan. Dine-in, pickup, and delivery — run from your phone. No commission on sales.",
  },
};

export async function generateMetadata({
  searchParams,
}: {
  searchParams: SearchParams;
}): Promise<Metadata> {
  const params = await searchParams;
  const headersList = await headers();
  const rawLang = Array.isArray(params.lang) ? params.lang[0] : params.lang;
  // Did the request carry an explicit, valid ?lang=? That distinction drives
  // the canonical: an explicit language URL self-canonicalizes; the bare `/`
  // (which auto-detects per visitor) is the x-default and canonicalizes to
  // itself. This gives search engines three stable, indexable language URLs
  // instead of one geo-varying page they can only ever see in English.
  const explicitLocale = isLandingLocale(rawLang) ? rawLang : null;
  const locale = resolveLandingLocale(
    params.lang,
    resolveDefaultLandingLocale(headersList),
  );
  const meta = META[locale];

  const canonical = explicitLocale ? `/?lang=${explicitLocale}` : "/";
  // hreflang cluster: every language version + an x-default. Next resolves
  // these against metadataBase into absolute alternate links.
  const languages: Record<string, string> = { "x-default": "/" };
  for (const l of LANDING_LOCALES) languages[l] = `/?lang=${l}`;

  return {
    metadataBase: new URL(SITE_URL),
    title: meta.title,
    description: meta.description,
    alternates: { canonical, languages },
    openGraph: {
      type: "website",
      siteName: "Krafta",
      url: `${SITE_URL}${canonical}`,
      title: meta.title,
      description: meta.description,
      locale: OG_LOCALE[locale],
      alternateLocale: LANDING_LOCALES.filter((l) => l !== locale).map(
        (l) => OG_LOCALE[l],
      ),
      images: [
        { url: "/og-image", width: 1200, height: 630, alt: "Krafta" },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title: meta.title,
      description: meta.description,
      images: ["/og-image"],
    },
  };
}

export default function Home({ searchParams }: { searchParams: SearchParams }) {
  // cacheComponents is on: the locale (searchParams) and auth state (cookies)
  // are request-dynamic, so the whole localized page resolves inside a Suspense
  // boundary. The static shell (theme-aware background) streams immediately;
  // the localized content swaps in on resolve.
  return (
    <Suspense fallback={<LandingShell />}>
      <LandingPage searchParams={searchParams} />
    </Suspense>
  );
}

function LandingShell() {
  return <div className="min-h-screen bg-background" aria-hidden />;
}

async function LandingPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const headersList = await headers();
  const locale = resolveLandingLocale(
    params.lang,
    resolveDefaultLandingLocale(headersList),
  );
  const content = getLandingContent(locale);
  const isUzbekistan = isUzbekistanVisitor(headersList);

  const supabase = await createClient();
  const { user } = await getUserSafely(supabase);
  const authed = Boolean(user);

  return (
    <div className="flex min-h-screen flex-col bg-background font-sans">
      <LandingJsonLd locale={locale} description={META[locale].description} />
      <HtmlLangSync locale={locale} />
      <LandingNav authed={authed} content={content} activeLocale={locale} />

      <main className="flex-1">
        <LandingHero authed={authed} content={content} locale={locale} />
        <LandingProof content={content} />
        <LandingProblem content={content} />
        <LandingFeatures content={content} />
        <LandingDashboard content={content} />
        <LandingChannels content={content} />
        <LandingPayments content={content} />
        <LandingAi content={content} />
        <LandingHow content={content} />
        <LandingPricing
          authed={authed}
          content={content}
          isUzbekistan={isUzbekistan}
        />
        <LandingFaq content={content} />
        <LandingClosing authed={authed} content={content} />
      </main>

      <LandingFooter authed={authed} content={content} activeLocale={locale} />
    </div>
  );
}
