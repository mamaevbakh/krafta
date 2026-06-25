/**
 * landing-features.tsx — asymmetric bento that breaks the old uniform-grid
 * rhythm: a large cell holds the real MERCHANT order list (token-built, the
 * surface the merchant actually buys), beside a hairline grid of plain-icon
 * feature cells. Borders + size do the hierarchy — no colored-circle icons
 * (Anti-Slop #2), no shadows (Anti-Slop #9), no pastel fills.
 */

import {
  BookOpen,
  LayoutList,
  Truck,
  Languages,
  Smartphone,
  Zap,
  type LucideIcon,
} from "lucide-react";

import { SectionHeading } from "./section-heading";
import { MerchantOrders } from "./merchant-orders";
import type { LandingContent } from "./content";

const FEATURE_ICONS: LucideIcon[] = [
  BookOpen, // digital menu
  LayoutList, // every order, one screen
  Truck, // delivery built in
  Languages, // three languages
  Smartphone, // all from your phone
  Zap, // free / ready in minutes
];

export function LandingFeatures({ content }: { content: LandingContent }) {
  const { features } = content;
  return (
    <section
      id="features"
      className="scroll-mt-16 border-t border-border bg-secondary-background"
    >
      <div className="mx-auto max-w-[1248px] px-6 py-20">
        <SectionHeading
          eyebrow={features.eyebrow}
          title={features.heading}
          subtitle={features.subheading}
        />

        <div className="mt-12 grid items-stretch gap-6 lg:grid-cols-2">
          <MerchantOrders content={content} className="min-h-[20rem]" />

          <div className="grid gap-px overflow-hidden rounded-xl border border-border bg-border sm:grid-cols-2">
            {features.items.map((item, i) => {
              const Icon = FEATURE_ICONS[i] ?? BookOpen;
              return (
                <div key={item.title} className="bg-card p-5">
                  <Icon
                    className="size-5 text-muted-foreground"
                    aria-hidden
                  />
                  <h3 className="mt-3 text-sm font-medium text-foreground">
                    {item.title}
                  </h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
                    {item.body}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}
