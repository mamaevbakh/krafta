/**
 * landing-ai.tsx — the "05 / AI" beat, framed honestly as roadmap (a dashed
 * СКОРО marker reusing the proof/pricing "not-yet-real" grammar). The band is a
 * two-panel conversation: the LEFT card is the guest's voice (natural-language
 * questions as speech rows), the RIGHT card is Krafta's answer (an assistant
 * input + one built suggestion in order-ticket grammar). The personalization
 * vision closes the section full-width. Token-built, no screenshot, no sci-fi —
 * and no empty cells (DESIGN.md §Anti-Slop #5).
 */

import { Search } from "lucide-react";

import { SectionEyebrow } from "./section-heading";
import { formatSum } from "./demo-shared";
import type { LandingContent } from "./content";

export function LandingAi({ content }: { content: LandingContent }) {
  const { ai } = content;
  return (
    <section id="ai" className="scroll-mt-16 border-t border-border">
      <div className="mx-auto max-w-[1248px] px-6 py-20">
        <div className="max-w-2xl">
          <div className="mb-3 flex items-center gap-2.5">
            <SectionEyebrow text={ai.eyebrow} />
            <span className="rounded-md border border-dashed border-border px-2 py-0.5 font-mono text-[10px] uppercase tracking-wide text-muted-foreground">
              {ai.soonLabel}
            </span>
          </div>
          <h2 className="text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
            {ai.heading}
          </h2>
          <p className="mt-3 text-base leading-relaxed text-muted-foreground sm:text-lg">
            {ai.subheading}
          </p>
        </div>

        <div className="mt-12 grid gap-6 lg:grid-cols-2 lg:items-stretch">
          {/* Guest voice — what people actually ask, in their own words */}
          <div className="flex flex-col rounded-xl border border-border bg-card p-5">
            <p className="font-mono text-[11px] uppercase tracking-wide text-muted-foreground">
              {ai.queriesLabel}
            </p>
            <ul className="mt-4 flex flex-col items-start gap-2.5">
              {ai.queries.map((query) => (
                <li
                  key={query}
                  className="max-w-[90%] rounded-xl rounded-bl-sm border border-border bg-secondary-background px-3.5 py-2 text-sm text-foreground"
                >
                  {query}
                </li>
              ))}
            </ul>
          </div>

          {/* Krafta answer — assistant input + a single built suggestion */}
          <div className="flex flex-col rounded-xl border border-border bg-card p-5">
            <div className="flex items-center gap-2.5 rounded-lg border border-border px-3.5 py-3 text-muted-foreground">
              <Search className="size-4 shrink-0" aria-hidden />
              <span className="text-sm">{ai.searchPlaceholder}</span>
            </div>
            <div className="mt-auto flex items-center justify-between gap-4 border-t border-border pt-4">
              <div className="min-w-0">
                <p className="font-mono text-[11px] uppercase tracking-wide text-muted-foreground">
                  {ai.suggestionMeta}
                </p>
                <p className="mt-1 truncate text-sm text-foreground">
                  {ai.suggestionName}
                </p>
              </div>
              <span className="shrink-0 font-mono text-sm tabular-nums text-foreground">
                {formatSum(ai.suggestionPrice)}
              </span>
            </div>
          </div>
        </div>

        <p className="mt-8 max-w-2xl text-base leading-relaxed text-muted-foreground">
          {ai.personalNote}
        </p>
      </div>
    </section>
  );
}
