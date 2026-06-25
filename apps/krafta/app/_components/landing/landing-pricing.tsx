/**
 * landing-pricing.tsx — Free plan (real, with the primary CTA) beside a Pro
 * plan marked "coming soon". No fabricated numbers: Krafta is free to start and
 * paid tiers (Krafta Pay + growth tools) are not priced yet.
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
  return (
    <section id="pricing" className="scroll-mt-16 border-t border-border">
      <div className="mx-auto max-w-[1248px] px-6 py-20">
        <SectionHeading
          eyebrow={pricing.eyebrow}
          title={pricing.heading}
          subtitle={pricing.subheading}
        />

        <div className="mt-12 grid gap-6 lg:grid-cols-2">
          {/* Free — the live, default plan */}
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
            <Button asChild size="lg" className="mt-8 w-full">
              <Link href={authed ? DASHBOARD_HREF : ONBOARDING_HREF}>
                {authed ? content.actions.dashboard : pricing.free.cta}
              </Link>
            </Button>
          </div>

          {/* Pro — coming soon */}
          <div className="flex flex-col rounded-xl border border-dashed border-border bg-background p-8">
            <div className="flex items-center gap-3">
              <p className="text-sm font-medium text-muted-foreground">
                {pricing.pro.name}
              </p>
              <Badge variant="secondary">{pricing.pro.badge}</Badge>
            </div>
            <p className="mt-3 max-w-sm text-sm leading-relaxed text-muted-foreground">
              {pricing.pro.note}
            </p>
            <ul className="mt-6 flex-1 space-y-3">
              {pricing.pro.features.map((feature) => (
                <PlanRow key={feature} muted>
                  {feature}
                </PlanRow>
              ))}
            </ul>
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
