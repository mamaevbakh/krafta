/**
 * landing-problem.tsx — the "01 / Problem" beat of the Commerce OS direction.
 * The old, broken way is SHOWN, not named: a scattered collage of the actual
 * messages a merchant gets today — a Telegram DM, an Instagram DM, a missed
 * call, a handwritten table note, a WhatsApp follow-up — each styled like a
 * real notification. Desktop scatters them with a light rotate/offset per
 * card; mobile stacks them flat and readable. Then a single foreground line
 * cuts through the noise.
 */

import {
  Instagram,
  MessageCircle,
  NotebookPen,
  PhoneMissed,
  Send,
  type LucideIcon,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { SectionEyebrow } from "./section-heading";
import type { LandingContent } from "./content";

const CHANNEL_ICON: Record<string, LucideIcon> = {
  telegram: Send,
  instagram: Instagram,
  whatsapp: MessageCircle,
  call: PhoneMissed,
  notebook: NotebookPen,
};

// Deterministic scatter per index — five messages, five offsets. Desktop only
// (sm:), so the "coming in from everywhere" feel doesn't fight mobile's stack.
const SCATTER = [
  "sm:-rotate-2 sm:translate-y-1",
  "sm:rotate-1 sm:-translate-y-2",
  "sm:rotate-2 sm:translate-y-3",
  "sm:-rotate-1 sm:-translate-y-3",
  "sm:rotate-2 sm:translate-y-0",
];

export function LandingProblem({ content }: { content: LandingContent }) {
  const { problem } = content;
  return (
    <section className="scroll-mt-16 border-t border-border">
      <div className="mx-auto max-w-[1248px] px-6 py-16">
        <SectionEyebrow text={problem.eyebrow} />
        <h2 className="mt-3 max-w-2xl text-3xl font-semibold leading-tight tracking-tight text-foreground sm:text-4xl">
          {problem.heading}
        </h2>

        <ul className="mt-10 flex flex-wrap gap-3 sm:gap-4">
          {problem.messages.map((m, i) => {
            const Icon = CHANNEL_ICON[m.channel] ?? Send;
            return (
              <li
                key={m.time}
                className={cn(
                  "w-full rounded-xl border border-border bg-card px-4 py-3 sm:w-[260px]",
                  SCATTER[i % SCATTER.length],
                )}
              >
                <div className="flex items-center gap-1.5">
                  <Icon className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
                  <span className="truncate font-mono text-[10px] uppercase tracking-wide text-muted-foreground">
                    {m.label}
                  </span>
                  <span className="ml-auto shrink-0 font-mono text-[10px] tabular-nums text-muted-foreground">
                    {m.time}
                  </span>
                </div>
                <p className="mt-1.5 text-sm leading-snug text-foreground">{m.text}</p>
              </li>
            );
          })}
        </ul>

        <p className="mt-10 max-w-xl text-base leading-relaxed text-foreground sm:text-lg">
          {problem.note}
        </p>
        <p className="mt-4 max-w-xl text-base leading-relaxed text-foreground sm:text-lg">
          {problem.contrast}
        </p>
      </div>
    </section>
  );
}
