"use client";

/**
 * landing-hero.tsx — two-column hero. Left: a mono order-ticket eyebrow, a
 * two-tone ownership headline (setup muted, payoff foreground — Supabase's
 * structure done with typography, not color), one subtitle, the CTA pair
 * ("Create your shop" + "View demo" — the demo opens whichever vertical is
 * selected in the switcher), and a mono capability spec row. Right: the
 * vertical switcher + the real storefront phone that tilts toward the cursor.
 *
 * Client component: it owns the switcher's selected index so the left "View
 * demo" button and the phone stay in sync. Left-aligned by intent — body copy
 * is never centered (DESIGN.md §Anti-Slop #10).
 */

import { useState } from "react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { DASHBOARD_HREF, ONBOARDING_HREF } from "./landing-actions";
import { HERO_SHOPS } from "./hero-shops";
import { StorefrontPhone } from "./storefront-phone";
import type { LandingContent, LandingLocale } from "./content";

export function LandingHero({
  authed,
  content,
}: {
  authed: boolean;
  content: LandingContent;
  locale: LandingLocale;
}) {
  const { hero, actions } = content;
  const [active, setActive] = useState(0);
  const demoShop = HERO_SHOPS[active];

  return (
    <section className="mx-auto max-w-[1248px] px-6 pb-16 pt-14 sm:pt-20">
      <div className="grid items-center gap-12 lg:grid-cols-[0.9fr_1.1fr] lg:gap-14">
        <div className="flex flex-col items-start">
          <p className="font-mono text-xs uppercase tracking-wider text-muted-foreground">
            {hero.eyebrow}
          </p>
          <h1 className="mt-5 text-balance text-4xl font-semibold leading-[1.08] tracking-tight sm:text-5xl">
            <span className="block text-muted-foreground">{hero.titleLead}</span>
            <span className="block text-foreground">{hero.titlePayoff}</span>
          </h1>
          <p className="mt-6 max-w-xl text-base leading-relaxed text-muted-foreground sm:text-lg">
            {hero.subtitle}
          </p>
          <div className="mt-8 flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
            <Button asChild size="lg">
              <Link href={authed ? DASHBOARD_HREF : ONBOARDING_HREF}>
                {authed ? actions.dashboard : actions.createShop}
              </Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <a
                href={`/${demoShop.slug}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                {actions.viewDemo}
              </a>
            </Button>
          </div>
          <p className="mt-5 font-mono text-xs uppercase tracking-wider text-muted-foreground">
            {hero.spec.join("  ·  ")}
          </p>
        </div>

        <div className="flex justify-center lg:justify-end">
          <StorefrontPhone active={active} onSelect={setActive} />
        </div>
      </div>
    </section>
  );
}
