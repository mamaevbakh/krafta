/**
 * landing-problem.tsx — the "01 / Problem" beat of the Commerce OS direction.
 * The old, broken way is named as dashed mono chips (the same "not-yet / not-
 * real" dashed signal used for soon-items in proof + pricing), then dismissed by
 * a single foreground line. No icons, no cards — type and rules carry it.
 */

import type { LandingContent } from "./content";

export function LandingProblem({ content }: { content: LandingContent }) {
  const { problem } = content;
  return (
    <section className="scroll-mt-16 border-t border-border">
      <div className="mx-auto max-w-[1248px] px-6 py-20">
        <p className="font-mono text-xs uppercase tracking-wider text-muted-foreground">
          {problem.eyebrow}
        </p>
        <h2 className="mt-3 max-w-2xl text-3xl font-semibold leading-tight tracking-tight text-foreground sm:text-4xl">
          {problem.heading}
        </h2>

        <ul className="mt-8 flex flex-wrap gap-2.5">
          {problem.fragments.map((fragment) => (
            <li
              key={fragment}
              className="rounded-md border border-dashed border-border px-3 py-1.5 font-mono text-xs uppercase tracking-wide text-muted-foreground"
            >
              {fragment}
            </li>
          ))}
        </ul>

        <p className="mt-8 max-w-xl text-base leading-relaxed text-foreground sm:text-lg">
          {problem.note}
        </p>
      </div>
    </section>
  );
}
