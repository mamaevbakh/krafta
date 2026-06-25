/**
 * landing-channels.tsx — the page's deliberate rhythm break: an asymmetric
 * editorial composition (heading anchored bottom-left, channel list as
 * mono-uppercase order-ticket labels on the right), borrowed from Vercel's
 * signature and matched to Krafta's industrial voice. No icons, no cards — type
 * and rules do the work.
 */

import { SectionEyebrow } from "./section-heading";
import type { LandingContent } from "./content";

export function LandingChannels({ content }: { content: LandingContent }) {
  const { channels } = content;
  return (
    <section id="channels" className="scroll-mt-16 border-t border-border">
      <div className="mx-auto grid max-w-[1248px] gap-12 px-6 py-16 lg:grid-cols-2 lg:gap-16">
        <div className="flex flex-col justify-between gap-10">
          <SectionEyebrow text={channels.eyebrow} />
          <h2 className="max-w-md text-3xl font-semibold leading-tight tracking-tight text-foreground sm:text-4xl">
            {channels.heading}
          </h2>
        </div>

        <ul className="divide-y divide-border">
          {channels.items.map((item) => (
            <li key={item.label} className="py-5 first:pt-0 last:pb-0">
              <p className="font-mono text-xs uppercase tracking-wider text-muted-foreground">
                {item.label}
              </p>
              <p className="mt-2 max-w-sm text-base leading-relaxed text-foreground">
                {item.body}
              </p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
