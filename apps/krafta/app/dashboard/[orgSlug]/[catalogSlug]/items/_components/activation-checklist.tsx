"use client";

// ADR 0005 §3 (eng review D9/D13/D20) — the activation checklist.
//
// Non-blocking, derived-from-state guidance over the Library: every row's
// done-state is computed from the shop itself (page fetch + one venue wave),
// so the checklist can never disagree with reality. Dismissal is the one
// non-derivable bit and lives in localStorage (per-device, accepted v1).
//
// "Set languages" from the ADR's draft list is deliberately absent: seeded
// translations exist from the first second, so no honest done-state is
// derivable from the page payload. Revisit when last_edited_by rides along.

import * as React from "react";
import Link from "next/link";
import { CheckCircle2, ChevronRight, Circle, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type ChecklistEntry = {
  key: string;
  label: string;
  done: boolean;
  href?: string;
};

export function ActivationChecklist({
  catalogId,
  entries,
}: {
  catalogId: string;
  entries: ChecklistEntry[];
}) {
  const storageKey = `krafta.checklist.dismissed.${catalogId}`;
  // Start hidden until the localStorage read resolves — avoids a flash of
  // the checklist for merchants who dismissed it.
  const [visible, setVisible] = React.useState(false);

  React.useEffect(() => {
    setVisible(localStorage.getItem(storageKey) !== "1");
  }, [storageKey]);

  const doneCount = entries.filter((e) => e.done).length;
  if (!visible || entries.length === 0 || doneCount === entries.length) {
    return null;
  }

  const dismiss = () => {
    localStorage.setItem(storageKey, "1");
    setVisible(false);
  };

  return (
    <section
      aria-label="Setup checklist"
      className="rounded-lg border bg-card"
    >
      <header className="flex items-center gap-3 border-b px-4 py-3">
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-medium">Get ready to open</h2>
          <p className="text-xs text-muted-foreground">
            <span className="font-mono tabular-nums">
              {doneCount}/{entries.length}
            </span>{" "}
            done — nothing here blocks you.
          </p>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-8 text-muted-foreground"
          onClick={dismiss}
          aria-label="Dismiss checklist"
        >
          <X className="size-4" />
        </Button>
      </header>
      <ul>
        {entries.map((entry) => {
          const row = (
            <span className="flex min-h-11 w-full items-center gap-3 px-4 py-2">
              {entry.done ? (
                <CheckCircle2 className="size-4 shrink-0" />
              ) : (
                <Circle className="size-4 shrink-0 text-muted-foreground" />
              )}
              <span
                className={cn(
                  "min-w-0 flex-1 truncate text-left text-sm",
                  entry.done && "text-muted-foreground line-through",
                )}
              >
                {entry.label}
              </span>
              {entry.href && !entry.done ? (
                <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
              ) : null}
            </span>
          );
          return (
            <li key={entry.key} className="border-b last:border-b-0">
              {entry.href && !entry.done ? (
                <Link
                  href={entry.href}
                  className="block transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {row}
                </Link>
              ) : (
                row
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
