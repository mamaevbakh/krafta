/**
 * landing-proof.tsx — the honest answer to the "social proof under the hero"
 * slot every reference site has. Krafta is pre-launch with no real logos, so
 * instead of fabricating a logo wall we ship a capability ledger: the strongest
 * positioning sentence + a row of mono capability chips. "Soon" items reuse the
 * dashed-border "not yet real" signal from the pricing Pro card, so the now-vs-
 * soon promise stays truthful.
 */

import { cn } from "@/lib/utils";
import type { LandingContent } from "./content";

export function LandingProof({ content }: { content: LandingContent }) {
  const { proof } = content;
  return (
    <section className="border-t border-border bg-secondary-background">
      <div className="mx-auto flex max-w-[1248px] flex-col gap-6 px-6 py-10 lg:flex-row lg:items-center lg:justify-between">
        <p className="max-w-xl text-base font-medium text-foreground sm:text-lg">
          {proof.statement}
        </p>
        <ul className="flex flex-wrap gap-2">
          {proof.ledger.map((chip) => (
            <li
              key={chip.label}
              className={cn(
                "rounded-md border px-2.5 py-1 font-mono text-xs uppercase tracking-wide",
                chip.soon
                  ? "border-dashed border-border text-muted-foreground"
                  : "border-border text-foreground",
              )}
            >
              {chip.label}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
