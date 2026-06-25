/**
 * landing-payments.tsx — the "04 / Payments" beat. A single flow row dramatizes
 * the positioning: local providers → Krafta → the merchant's storefront, i.e.
 * payments are a layer of the system, not a plugin the merchant wires up. The
 * Krafta wordmark sits at the centre of the flow. Providers/storefront read as
 * mono order-ticket chips; the arrows collapse out on mobile so the row stacks.
 */

import { ArrowRight } from "lucide-react";

import { BrandWordmark } from "@/components/brand/brand-wordmark";
import { SectionHeading } from "./section-heading";
import type { LandingContent } from "./content";

export function LandingPayments({ content }: { content: LandingContent }) {
  const { payments } = content;
  return (
    <section
      id="payments"
      className="scroll-mt-16 border-t border-border bg-secondary-background"
    >
      <div className="mx-auto max-w-[1248px] px-6 py-20">
        <SectionHeading
          eyebrow={payments.eyebrow}
          title={payments.heading}
          subtitle={payments.subheading}
        />

        <div className="mt-12 flex flex-col items-start gap-5 rounded-xl border border-border bg-card p-6 sm:flex-row sm:items-center sm:gap-6">
          <div className="flex flex-wrap gap-2">
            {payments.providers.map((provider) => (
              <span
                key={provider}
                className="rounded-md border border-border px-3 py-1.5 font-mono text-xs uppercase tracking-wide text-foreground"
              >
                {provider}
              </span>
            ))}
          </div>

          <ArrowRight
            className="hidden size-4 shrink-0 text-muted-foreground sm:block"
            aria-hidden
          />
          <BrandWordmark className="text-xl" />
          <ArrowRight
            className="hidden size-4 shrink-0 text-muted-foreground sm:block"
            aria-hidden
          />

          <span className="rounded-md border border-border px-3 py-1.5 font-mono text-xs uppercase tracking-wide text-foreground">
            {payments.storefrontLabel}
          </span>
        </div>

        <p className="mt-6 max-w-xl text-sm leading-relaxed text-muted-foreground">
          {payments.flowNote}
        </p>
      </div>
    </section>
  );
}
