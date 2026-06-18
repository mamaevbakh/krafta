import type { Metadata } from "next";
import { Suspense } from "react";

import { createClient } from "@/lib/supabase/server";
import { getUserSafely } from "@krafta/supabase/auth";

import {
  getLandingContent,
  resolveLandingLocale,
  type LandingLocale,
} from "./_components/landing/content";
import { LandingNav } from "./_components/landing/landing-nav";
import { LandingHero } from "./_components/landing/landing-hero";
import { LandingProof } from "./_components/landing/landing-proof";
import { LandingFeatures } from "./_components/landing/landing-features";
import { LandingHow } from "./_components/landing/landing-how";
import { LandingChannels } from "./_components/landing/landing-channels";
import { LandingPricing } from "./_components/landing/landing-pricing";
import { LandingFaq } from "./_components/landing/landing-faq";
import { LandingClosing } from "./_components/landing/landing-closing";
import { LandingFooter } from "./_components/landing/landing-footer";

type SearchParams = Promise<{ [key: string]: string | string[] | undefined }>;

const META: Record<LandingLocale, { title: string; description: string }> = {
  ru: {
    title: "Krafta — касса и приём заказов для кафе",
    description:
      "Касса и платформа приёма заказов уровня Square для кафе, ресторанов и магазинов Узбекистана. Цифровое меню, зал, самовывоз и доставка — управление с телефона.",
  },
  uz: {
    title: "Krafta — kafe uchun kassa va buyurtmalar",
    description:
      "Oʻzbekistondagi kafe, restoran va doʻkonlar uchun Square darajasidagi kassa va buyurtma platformasi. Raqamli menyu, zal, olib ketish va yetkazib berish — telefondan boshqaring.",
  },
  en: {
    title: "Krafta — POS & ordering for cafes",
    description:
      "A Square-quality point of sale and ordering platform for cafes, restaurants, and shops in Uzbekistan. Digital menu, dine-in, pickup, and delivery — managed from your phone.",
  },
};

export async function generateMetadata({
  searchParams,
}: {
  searchParams: SearchParams;
}): Promise<Metadata> {
  const params = await searchParams;
  const locale = resolveLandingLocale(params.lang);
  return META[locale];
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
  const locale = resolveLandingLocale(params.lang);
  const content = getLandingContent(locale);

  const supabase = await createClient();
  const { user } = await getUserSafely(supabase);
  const authed = Boolean(user);

  return (
    <div className="flex min-h-screen flex-col bg-background font-sans">
      <LandingNav authed={authed} content={content} activeLocale={locale} />

      <main className="flex-1">
        <LandingHero authed={authed} content={content} locale={locale} />
        <LandingProof content={content} />
        <LandingFeatures content={content} />
        <LandingHow content={content} />
        <LandingChannels content={content} />
        <LandingPricing authed={authed} content={content} />
        <LandingFaq content={content} />
        <LandingClosing authed={authed} content={content} />
      </main>

      <LandingFooter authed={authed} content={content} activeLocale={locale} />
    </div>
  );
}
