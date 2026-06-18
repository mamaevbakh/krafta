/**
 * landing-closing.tsx — final brand band + CTA. The giant Helvetica Neue Bold
 * wordmark at clamp(...) is the page's ONLY loud moment (DESIGN.md reserves that
 * size for the landing wordmark). Centered by intent — the marketing brand band
 * is the one allowed centered layout (Anti-Slop #3). The heading mirrors the
 * hero's two-tone structure for a bookend; there is no centered body paragraph
 * (Anti-Slop #10) — the wordmark + heading + CTAs carry the close.
 */

import { BrandWordmark } from "@/components/brand/brand-wordmark";
import { LandingActions } from "./landing-actions";
import type { LandingContent } from "./content";

export function LandingClosing({
  authed,
  content,
}: {
  authed: boolean;
  content: LandingContent;
}) {
  const { closing } = content;
  return (
    <section className="border-t border-border">
      <div className="mx-auto flex max-w-[1248px] flex-col items-center px-6 py-24 text-center">
        <BrandWordmark className="leading-none text-[clamp(4rem,10vw,12rem)]" />
        <h2 className="mt-10 max-w-2xl text-balance text-2xl font-semibold tracking-tight sm:text-3xl">
          <span className="text-muted-foreground">{closing.headingLead}</span>{" "}
          <span className="text-foreground">{closing.headingPayoff}</span>
        </h2>
        <LandingActions
          authed={authed}
          content={content}
          className="mt-8 flex flex-col gap-3 sm:flex-row"
        />
      </div>
    </section>
  );
}
