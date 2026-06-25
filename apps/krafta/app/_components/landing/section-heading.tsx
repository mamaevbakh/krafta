/**
 * section-heading.tsx — shared left-aligned section header. An optional mono
 * UPPERCASE eyebrow (the page's order-ticket label grammar) sits above the
 * title. Title can be emphatic; subtitle stays left-aligned and muted
 * (DESIGN.md §Anti-Slop #10).
 */

import { cn } from "@/lib/utils";

/**
 * SectionEyebrow — the page's mono UPPERCASE micro-label. When the label is a
 * numbered spec-sheet index ("02 / Operating system"), the leading numeral is
 * promoted to foreground so the scroll actually reads as "02 of 07" — one
 * typographic tier, no color, weight capped at the mono default (DESIGN.md).
 * Shared so the inline-eyebrow sections (problem, channels) match the ones that
 * render through SectionHeading.
 */
export function SectionEyebrow({
  text,
  className,
}: {
  text: string;
  className?: string;
}) {
  const indexed = /^(\d+)\s*\/\s*(.+)$/.exec(text);
  return (
    <p
      className={cn(
        "font-mono text-xs uppercase tracking-wider text-muted-foreground",
        className,
      )}
    >
      {indexed ? (
        <>
          <span className="text-foreground">{indexed[1]}</span>
          <span> / {indexed[2]}</span>
        </>
      ) : (
        text
      )}
    </p>
  );
}

export function SectionHeading({
  eyebrow,
  title,
  subtitle,
  className,
}: {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  className?: string;
}) {
  return (
    <div className={cn("max-w-2xl", className)}>
      {eyebrow ? <SectionEyebrow text={eyebrow} className="mb-3" /> : null}
      <h2 className="text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
        {title}
      </h2>
      {subtitle ? (
        <p className="mt-3 text-base leading-relaxed text-muted-foreground sm:text-lg">
          {subtitle}
        </p>
      ) : null}
    </div>
  );
}
