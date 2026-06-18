/**
 * landing-how.tsx — three numbered steps as an OPEN horizontal band (no
 * bordered grid), deliberately a different shape from the features bento so the
 * page stops scanning as one repeated module. Big Geist Mono numerals carry the
 * sequence.
 */

import { SectionHeading } from "./section-heading";
import type { LandingContent } from "./content";

export function LandingHow({ content }: { content: LandingContent }) {
  const { how } = content;
  return (
    <section
      id="how"
      className="scroll-mt-16 border-t border-border bg-secondary-background"
    >
      <div className="mx-auto max-w-[1248px] px-6 py-20">
        <SectionHeading
          eyebrow={how.eyebrow}
          title={how.heading}
          subtitle={how.subheading}
        />
        <ol className="mt-12 grid gap-x-8 gap-y-10 md:grid-cols-3">
          {how.steps.map((step, i) => (
            <li key={step.title} className="border-t border-border pt-5">
              <span className="font-mono text-2xl font-medium tabular-nums text-muted-foreground">
                {String(i + 1).padStart(2, "0")}
              </span>
              <h3 className="mt-4 text-lg font-medium text-foreground">
                {step.title}
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                {step.body}
              </p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
