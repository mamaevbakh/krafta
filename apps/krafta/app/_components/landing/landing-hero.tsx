/**
 * landing-hero.tsx — two-column hero. Left: a mono order-ticket eyebrow, a
 * two-tone outcome headline (problem muted, payoff foreground — Supabase's
 * structure done with typography, not color), one warm subtitle, the CTA pair,
 * and a mono capability spec row. Right: the interactive counter demo.
 *
 * Left-aligned by intent — body copy is never centered (DESIGN.md §Anti-Slop
 * #10); the giant centered wordmark lives only in the closing band.
 */

import { LandingActions } from "./landing-actions";
import { CounterDemo } from "./counter-demo";
import type { LandingContent, LandingLocale } from "./content";

export function LandingHero({
  authed,
  content,
  locale,
}: {
  authed: boolean;
  content: LandingContent;
  locale: LandingLocale;
}) {
  const { hero } = content;
  return (
    <section className="mx-auto max-w-[1248px] px-6 pb-16 pt-14 sm:pt-20">
      <div className="grid items-center gap-12 lg:grid-cols-2 lg:gap-16">
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
          <LandingActions
            authed={authed}
            content={content}
            className="mt-8 flex w-full flex-col gap-3 sm:w-auto sm:flex-row"
          />
          <p className="mt-5 font-mono text-xs uppercase tracking-wider text-muted-foreground">
            {hero.spec.join("  ·  ")}
          </p>
        </div>

        <div className="flex justify-center lg:justify-end">
          {/* key by locale so the demo's order state resets to the new
              locale's item names on a ?lang= switch */}
          <CounterDemo key={locale} content={content} />
        </div>
      </div>
    </section>
  );
}
