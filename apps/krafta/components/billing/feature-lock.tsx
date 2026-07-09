import Link from "next/link";
import { Lock } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { type PlanTier, tierLabel } from "@/lib/billing/tiers";

/**
 * FeatureLock — the on-system upgrade wall shown when a tier-gated capability
 * is locked for the current org. Copy is passed in by the caller so each
 * surface can localize / phrase it in context. No gradients, no decoration —
 * a plain bordered callout per DESIGN.md.
 */
export function FeatureLock({
  requiredTier,
  title,
  description,
  billingHref,
  ctaLabel,
  className,
  compact = false,
}: {
  requiredTier: PlanTier;
  title: string;
  description?: string;
  billingHref: string;
  ctaLabel?: string;
  className?: string;
  compact?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex flex-col gap-3 rounded-lg border border-border bg-muted/30",
        compact ? "p-3 sm:flex-row sm:items-center sm:justify-between" : "p-5",
        className,
      )}
    >
      <div className="flex items-start gap-3">
        <div className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-md border border-border bg-background">
          <Lock className="size-4 text-muted-foreground" aria-hidden />
        </div>
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-medium text-foreground">{title}</p>
            <Badge variant="secondary" className="rounded-full">
              {tierLabel(requiredTier)}
            </Badge>
          </div>
          {description ? (
            <p className="text-sm text-muted-foreground">{description}</p>
          ) : null}
        </div>
      </div>
      <Button
        asChild
        size="sm"
        variant="default"
        className={cn(compact ? "sm:w-auto" : "w-full sm:w-fit")}
      >
        <Link href={billingHref}>{ctaLabel ?? `Upgrade to ${tierLabel(requiredTier)}`}</Link>
      </Button>
    </div>
  );
}

/** Inline pill marking a control as requiring a given tier (e.g. next to a disabled switch). */
export function RequiresTierBadge({
  tier,
  className,
}: {
  tier: PlanTier;
  className?: string;
}) {
  return (
    <Badge variant="outline" className={cn("rounded-full", className)}>
      <Lock className="mr-1 size-3" aria-hidden />
      {tierLabel(tier)}
    </Badge>
  );
}
