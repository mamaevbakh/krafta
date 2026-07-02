/**
 * landing-features.tsx — a full-width hairline grid of the six capabilities. The
 * old bento held a mock order list beside the grid; that's retired now that the
 * real merchant dashboard is shown in its own section right below — the fake
 * couldn't sit above the real. Borders + size do the hierarchy, plain muted
 * icons only (no colored-circle icons, Anti-Slop #2; no shadows, #9).
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
import type { LandingContent } from "./content";

const FEATURE_ICONS: LucideIcon[] = [
  BookOpen, // menu & catalog
  LayoutList, // every order, one screen
  Truck, // delivery built in
  Languages, // any language
  Smartphone, // run it from your phone
  Zap, // QR as a sales channel
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

        <div className="mt-12 grid gap-px overflow-hidden rounded-xl border border-border bg-border sm:grid-cols-2 lg:grid-cols-3">
          {features.items.map((item, i) => {
            const Icon = FEATURE_ICONS[i] ?? BookOpen;
            return (
              <div key={item.title} className="flex flex-col bg-card p-6">
                <Icon className="size-5 text-muted-foreground" aria-hidden />
                <h3 className="mt-4 text-base font-medium text-foreground">
                  {item.title}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                  {item.body}
                </p>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
