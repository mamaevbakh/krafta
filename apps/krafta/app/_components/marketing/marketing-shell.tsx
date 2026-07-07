/**
 * marketing-shell.tsx — shared chrome for standalone marketing pages (pricing,
 * vs/*, for/*). A minimal sticky header (wordmark → home, sign-in, primary CTA)
 * and a lean footer. Deliberately NOT the landing's LandingNav — that carries
 * on-page section anchors (#features, #pricing) that don't exist here. Content
 * pages are RU-first (the primary search market); copy lives inline.
 *
 * Reuses the design system only: BrandWordmark, shadcn Button, hairline borders
 * — no new visual language (DESIGN.md).
 */

import Link from "next/link";
import type { ReactNode } from "react";

import { BrandWordmark } from "@/components/brand/brand-wordmark";
import { Button } from "@/components/ui/button";
import { ONBOARDING_HREF, SIGN_IN_HREF } from "../landing/landing-actions";

export function MarketingShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-background font-sans">
      <MarketingHeader />
      <main className="flex-1">{children}</main>
      <MarketingFooter />
    </div>
  );
}

function MarketingHeader() {
  return (
    <header className="sticky top-0 z-50 border-b border-border bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="mx-auto flex h-16 max-w-[1248px] items-center justify-between gap-4 px-6">
        <Link
          href="/"
          aria-label="Krafta"
          className="rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <BrandWordmark className="text-2xl" />
        </Link>
        <div className="flex items-center gap-2">
          <Button asChild variant="ghost" size="sm" className="hidden sm:inline-flex">
            <Link href="/pricing">Цены</Link>
          </Button>
          <Button asChild variant="ghost" size="sm">
            <Link href={SIGN_IN_HREF} prefetch={false}>Войти</Link>
          </Button>
          <Button asChild size="sm">
            <Link href={ONBOARDING_HREF}>Создать магазин</Link>
          </Button>
        </div>
      </div>
    </header>
  );
}

function MarketingFooter() {
  return (
    <footer className="border-t border-border bg-secondary-background">
      <div className="mx-auto flex max-w-[1248px] flex-col gap-4 px-6 py-10 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <BrandWordmark className="text-xl" />
          <span className="text-sm text-muted-foreground">
            Витрина, заказы и QR-меню — без комиссии.
          </span>
        </div>
        <nav className="flex items-center gap-5 text-sm text-muted-foreground">
          <Link href="/" className="hover:text-foreground">Главная</Link>
          <Link href="/pricing" className="hover:text-foreground">Цены</Link>
          <Link href={ONBOARDING_HREF} className="hover:text-foreground">
            Создать магазин
          </Link>
        </nav>
      </div>
    </footer>
  );
}

/** A left-aligned page hero for content pages — eyebrow + big title + lede. */
export function MarketingHero({
  eyebrow,
  title,
  lede,
  cta,
}: {
  eyebrow?: string;
  title: ReactNode;
  lede?: ReactNode;
  cta?: ReactNode;
}) {
  return (
    <section className="border-b border-border">
      <div className="mx-auto max-w-[1248px] px-6 py-16 sm:py-20">
        {eyebrow ? (
          <p className="font-mono text-xs uppercase tracking-wider text-muted-foreground">
            {eyebrow}
          </p>
        ) : null}
        <h1 className="mt-3 max-w-3xl text-4xl font-semibold leading-tight tracking-tight text-foreground sm:text-5xl">
          {title}
        </h1>
        {lede ? (
          <p className="mt-5 max-w-2xl text-lg leading-relaxed text-muted-foreground">
            {lede}
          </p>
        ) : null}
        {cta ? <div className="mt-8 flex flex-wrap gap-3">{cta}</div> : null}
      </div>
    </section>
  );
}

/** A closing call-to-action band, reused at the bottom of every content page. */
export function MarketingCta({
  title,
  body,
}: {
  title: string;
  body?: string;
}) {
  return (
    <section className="border-t border-border bg-secondary-background">
      <div className="mx-auto max-w-[1248px] px-6 py-16 text-center">
        <h2 className="mx-auto max-w-2xl text-3xl font-semibold tracking-tight sm:text-4xl">
          {title}
        </h2>
        {body ? (
          <p className="mx-auto mt-4 max-w-xl text-base leading-relaxed text-muted-foreground">
            {body}
          </p>
        ) : null}
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <Button asChild size="lg">
            <Link href={ONBOARDING_HREF}>Создать магазин бесплатно</Link>
          </Button>
          <Button asChild size="lg" variant="outline">
            <Link href="/pricing">Посмотреть цены</Link>
          </Button>
        </div>
      </div>
    </section>
  );
}
