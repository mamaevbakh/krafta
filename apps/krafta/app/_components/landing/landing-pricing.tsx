/**
 * landing-pricing.tsx — three tiers: Free (live), Pro (live, $20, highlighted),
 * and Business ($39) whose marquee features (Krafta Pay, AI) are marked "soon".
 * Free and Pro start via the onboarding CTA; Business is sales-led (founding
 * offer in the note), so it carries a note instead of a self-serve CTA.
 */

import Link from "next/link";
import { Check } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { SectionHeading } from "./section-heading";
import { DASHBOARD_HREF, ONBOARDING_HREF } from "./landing-actions";
import type { LandingContent } from "./content";

export function LandingPricing({
  authed,
  content,
}: {
  authed: boolean;
  content: LandingContent;
}) {
  const { pricing } = content;
  const startHref = authed ? DASHBOARD_HREF : ONBOARDING_HREF;
  const startLabel = authed ? content.actions.dashboard : pricing.free.cta;
  return (
    <section id="pricing" className="scroll-mt-16 border-t border-border">
      <div className="mx-auto max-w-[1248px] px-6 py-20">
        <SectionHeading
          eyebrow={pricing.eyebrow}
          title={pricing.heading}
          subtitle={pricing.subheading}
        />

        <div className="mt-12 grid items-stretch gap-6 lg:grid-cols-3">
          {/* Free — live, entry plan */}
          <div className="flex flex-col rounded-xl border border-border bg-card p-8">
            <p className="text-sm font-medium text-muted-foreground">
              {pricing.free.name}
            </p>
            <div className="mt-3 flex items-baseline gap-2">
              <span className="font-mono text-5xl font-semibold tabular-nums tracking-tight text-foreground">
                {pricing.free.price}
              </span>
              <span className="text-sm text-muted-foreground">
                {pricing.free.period}
              </span>
            </div>
            <ul className="mt-6 flex-1 space-y-3">
              {pricing.free.features.map((feature) => (
                <PlanRow key={feature}>{feature}</PlanRow>
              ))}
            </ul>
            <Button asChild size="lg" variant="outline" className="mt-8 w-full">
              <Link href={startHref}>{startLabel}</Link>
            </Button>
          </div>

          {/* Pro — live, highlighted */}
          <div className="flex flex-col rounded-xl border-2 border-foreground bg-card p-8">
            <div className="flex items-center gap-3">
              <p className="text-sm font-medium text-foreground">
                {pricing.pro.name}
              </p>
              <Badge variant="secondary">{pricing.pro.badge}</Badge>
            </div>
            <div className="mt-3 flex items-baseline gap-2">
              <span className="font-mono text-5xl font-semibold tabular-nums tracking-tight text-foreground">
                {pricing.pro.price}
              </span>
              <span className="text-sm text-muted-foreground">
                {pricing.pro.period}
              </span>
            </div>
            <p className="mt-4 text-sm text-muted-foreground">
              {pricing.pro.includes}
            </p>
            <ul className="mt-3 flex-1 space-y-3">
              {pricing.pro.features.map((feature) => (
                <PlanRow key={feature}>{feature}</PlanRow>
              ))}
            </ul>
            <Button asChild size="lg" className="mt-8 w-full">
              <Link href={startHref}>{startLabel}</Link>
            </Button>
          </div>

          {/* Business — priced, marquee features forthcoming, sales-led */}
          <div className="flex flex-col rounded-xl border border-border bg-card p-8">
            <p className="text-sm font-medium text-muted-foreground">
              {pricing.business.name}
            </p>
            <div className="mt-3 flex items-baseline gap-2">
              <span className="font-mono text-5xl font-semibold tabular-nums tracking-tight text-foreground">
                {pricing.business.price}
              </span>
              <span className="text-sm text-muted-foreground">
                {pricing.business.period}
              </span>
            </div>
            <p className="mt-4 text-sm text-muted-foreground">
              {pricing.business.includes}
            </p>
            <ul className="mt-3 flex-1 space-y-3">
              {pricing.business.features.map((feature) => (
                <PlanRow key={feature} muted>
                  {feature}
                </PlanRow>
              ))}
            </ul>
            <p className="mt-8 text-sm leading-relaxed text-muted-foreground">
              {pricing.business.note}
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}

function PlanRow({
  children,
  muted = false,
}: {
  children: React.ReactNode;
  muted?: boolean;
}) {
  return (
    <li className="flex items-start gap-3">
      <Check
        className={cn(
          "mt-0.5 size-4 shrink-0",
          muted ? "text-muted-foreground" : "text-foreground",
        )}
        aria-hidden
      />
      <span
        className={cn(
          "text-sm",
          muted ? "text-muted-foreground" : "text-foreground",
        )}
      >
        {children}
      </span>
    </li>
  );
}
