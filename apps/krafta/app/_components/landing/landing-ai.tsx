/**
 * landing-ai.tsx — the "05 / AI" beat, framed honestly as roadmap (a dashed
 * СКОРО marker reusing the proof/pricing "not-yet-real" grammar). This is a core
 * vision, so unlike the other left-aligned sections it gets a centered spotlight:
 * a larger heading, and the alive conversation demo centered as the focal element,
 * with the personalization vision as a caption beneath. Centering here is a
 * deliberate exception to DESIGN.md §Anti-Slop #3 (founder-requested) — the AI
 * moat is the second intentional centered moment after the hero.
 */

import { SectionEyebrow } from "./section-heading";
import { LandingAiConversation } from "./landing-ai-conversation";
import type { LandingContent } from "./content";

export function LandingAi({ content }: { content: LandingContent }) {
  const { ai } = content;
  return (
    <section id="ai" className="scroll-mt-16 border-t border-border">
      <div className="mx-auto max-w-[1248px] px-6 py-24">
        <div className="mx-auto max-w-2xl text-center">
          <div className="mb-4 flex items-center justify-center gap-2.5">
            <SectionEyebrow text={ai.eyebrow} />
            <span className="rounded-md border border-dashed border-border px-2 py-0.5 font-mono text-[10px] uppercase tracking-wide text-muted-foreground">
              {ai.soonLabel}
            </span>
          </div>
          <h2 className="text-balance text-4xl font-semibold tracking-tight text-foreground sm:text-5xl">
            {ai.heading}
          </h2>
          <p className="mx-auto mt-5 max-w-xl text-lg leading-relaxed text-muted-foreground">
            {ai.subheading}
          </p>
        </div>

        <div className="mx-auto mt-12 w-full max-w-md">
          <LandingAiConversation />
        </div>

        <p className="mx-auto mt-8 max-w-xl text-center text-sm leading-relaxed text-muted-foreground">
          {ai.personalNote}
        </p>
      </div>
    </section>
  );
}
