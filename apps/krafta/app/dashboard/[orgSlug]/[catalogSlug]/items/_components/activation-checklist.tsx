"use client";

// ADR 0005 §3 (eng review D9/D13/D20) — the activation checklist.
//
// A floating bottom-right setup guide (Shopify-style), styled to match the
// Library's other floating pill (the bottom-center view toggle): same z-30
// layer, same frosted rounded surface. Expanded panel on first visit;
// collapses to a compact progress pill; both the collapsed state and the
// forever-dismiss live in localStorage (the one non-derivable bit, D9).
//
// Every row's done-state is computed from the shop itself (page fetch + one
// venue wave), so the checklist can never disagree with reality.
//
// "Set languages" from the ADR's draft list is deliberately absent: seeded
// translations exist from the first second, so no honest done-state is
// derivable from the page payload. Revisit when last_edited_by rides along.

import * as React from "react";
import Link from "next/link";
import {
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Circle,
  ListTodo,
  X,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type ChecklistEntry = {
  key: string;
  label: string;
  done: boolean;
  href?: string;
};

// z-30: above the canvas, below the EditorSheet/Dialog backdrops (z-50) —
// same layer contract as the view-toggle pill. bottom-right so the two
// floating controls never collide (toggle is bottom-center, md+ only).
const CORNER = "fixed bottom-4 right-4 z-30 md:bottom-6 md:right-6";

export function ActivationChecklist({
  catalogId,
  entries,
}: {
  catalogId: string;
  entries: ChecklistEntry[];
}) {
  const dismissKey = `krafta.checklist.dismissed.${catalogId}`;
  const openKey = `krafta.checklist.open.${catalogId}`;
  // Render nothing until localStorage resolves — avoids flashing the panel
  // for merchants who dismissed or collapsed it.
  const [ready, setReady] = React.useState(false);
  const [dismissed, setDismissed] = React.useState(true);
  const [open, setOpen] = React.useState(true);

  React.useEffect(() => {
    setDismissed(localStorage.getItem(dismissKey) === "1");
    setOpen(localStorage.getItem(openKey) !== "0");
    setReady(true);
  }, [dismissKey, openKey]);

  const doneCount = entries.filter((e) => e.done).length;
  if (!ready || dismissed || entries.length === 0 || doneCount === entries.length) {
    return null;
  }

  const collapse = () => {
    localStorage.setItem(openKey, "0");
    setOpen(false);
  };
  const expand = () => {
    localStorage.setItem(openKey, "1");
    setOpen(true);
  };
  const dismiss = () => {
    localStorage.setItem(dismissKey, "1");
    setDismissed(true);
  };

  if (!open) {
    return (
      <button
        type="button"
        onClick={expand}
        className={cn(
          CORNER,
          "flex min-h-11 items-center gap-2 rounded-full border bg-background/85 px-4 py-2.5 text-sm font-medium shadow-sm backdrop-blur-md transition-colors hover:bg-accent",
          "animate-in fade-in-0 slide-in-from-bottom-2 duration-200",
        )}
        aria-label="Open setup checklist"
      >
        <ListTodo className="size-4 text-muted-foreground" />
        <span className="hidden sm:inline">Get ready to open</span>
        <span className="font-mono text-xs tabular-nums text-muted-foreground">
          {doneCount}/{entries.length}
        </span>
      </button>
    );
  }

  return (
    <section
      aria-label="Setup checklist"
      className={cn(
        CORNER,
        "w-[min(20rem,calc(100vw-2rem))] overflow-hidden rounded-lg border bg-background/95 shadow-sm backdrop-blur-md",
        "animate-in fade-in-0 slide-in-from-bottom-2 duration-200",
      )}
    >
      <header className="flex items-center gap-1 border-b py-2 pl-4 pr-2">
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
          onClick={collapse}
          aria-label="Collapse checklist"
        >
          <ChevronDown className="size-4" />
        </Button>
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
      <ul className="max-h-[min(20rem,50vh)] overflow-y-auto">
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
