/**
 * landing-ai.tsx — the "05 / AI" beat. A clean, no-robots mock of the storefront
 * search + assistant: a search field, three natural-language guest queries as
 * pills, and a single suggested item rendered in order-ticket grammar (mono meta
 * + UZS tabular-nums). A short line on the right carries the personalization
 * vision. Token-built, no screenshot, no sci-fi.
 */

import { Search } from "lucide-react";

import { SectionHeading } from "./section-heading";
import { formatSum } from "./demo-shared";
import type { LandingContent } from "./content";

export function LandingAi({ content }: { content: LandingContent }) {
  const { ai } = content;
  return (
    <section id="ai" className="scroll-mt-16 border-t border-border">
      <div className="mx-auto max-w-[1248px] px-6 py-20">
        <SectionHeading
          eyebrow={ai.eyebrow}
          title={ai.heading}
          subtitle={ai.subheading}
        />

        <div className="mt-12 grid gap-6 lg:grid-cols-2 lg:items-stretch">
          <div className="flex flex-col rounded-xl border border-border bg-card p-5">
            <div className="flex items-center gap-2.5 rounded-lg border border-border px-3.5 py-3 text-muted-foreground">
              <Search className="size-4 shrink-0" aria-hidden />
              <span className="text-sm">{ai.searchPlaceholder}</span>
            </div>

            <ul className="mt-4 flex flex-col items-start gap-2">
              {ai.queries.map((query) => (
                <li
                  key={query}
                  className="rounded-full border border-border px-3.5 py-1.5 text-sm text-foreground"
                >
                  {query}
                </li>
              ))}
            </ul>

            <div className="mt-5 flex items-center justify-between gap-4 border-t border-border pt-4">
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

          <div className="flex flex-col justify-center">
            <p className="max-w-md text-lg leading-relaxed text-foreground">
              {ai.personalNote}
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
