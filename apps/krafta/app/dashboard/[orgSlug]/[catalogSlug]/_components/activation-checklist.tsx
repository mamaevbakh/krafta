"use client";

// ADR 0005 §3 (eng review D9/D13/D20) — the activation checklist.
//
// A floating bottom-right setup guide (Shopify-style), styled to match the
// Library's other floating pill (the bottom-center view toggle): same z-30
// layer, same frosted rounded surface. First visit: expanded on md+ where
// there's room, a compact pill on mobile — the expanded panel would cover
// the merchant's freshly seeded menu, which is the payoff of the wizard.
// After that the merchant's own choice persists (localStorage, per catalog —
// the one non-derivable bit, D9). Deliberately NO forever-dismiss: a one-click
// permanent kill next to the collapse button was a fat-finger trap with no
// undo and no re-entry point. The widget's natural exit is completing the
// list — it removes itself when every row is done.
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
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/locales/dashboard/context";

import { SecureAccountDialog } from "./secure-account-dialog";

export type ChecklistEntry = {
  key: string;
  label: string;
  done: boolean;
  href?: string;
  /** Rows that open a dialog instead of navigating (e.g. "Secure your shop"). */
  action?: "secure";
};

// z-30: above the canvas, below the EditorSheet/Dialog backdrops (z-50) —
// same layer contract as the view-toggle pill. bottom-right so the two
// floating controls never collide (toggle is bottom-center, md+ only).
const CORNER = "fixed bottom-4 right-4 z-30 md:bottom-6 md:right-6";

export function ActivationChecklist({
  catalogId,
  orgSlug,
  catalogSlug,
  telegramBotUsername,
  entries,
}: {
  catalogId: string;
  orgSlug: string;
  catalogSlug: string;
  telegramBotUsername: string | null;
  entries: ChecklistEntry[];
}) {
  const t = useT();
  const openKey = `krafta.checklist.open.${catalogId}`;
  // Render nothing until localStorage resolves — avoids flashing the panel
  // for merchants who collapsed it.
  const [ready, setReady] = React.useState(false);
  const [open, setOpen] = React.useState(true);
  const [secureOpen, setSecureOpen] = React.useState(false);

  React.useEffect(() => {
    const stored = localStorage.getItem(openKey);
    if (stored !== null) {
      setOpen(stored !== "0");
    } else {
      setOpen(window.matchMedia("(min-width: 768px)").matches);
    }
    setReady(true);
  }, [openKey]);

  const doneCount = entries.filter((e) => e.done).length;
  if (!ready || entries.length === 0 || doneCount === entries.length) {
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
        aria-label={t("activation.checklist.open_aria")}
      >
        <ListTodo className="size-4 text-muted-foreground" />
        <span className="hidden sm:inline">{t("activation.checklist.title")}</span>
        <span className="font-mono text-xs tabular-nums text-muted-foreground">
          {doneCount}/{entries.length}
        </span>
      </button>
    );
  }

  const secureDialog = (
    <SecureAccountDialog
      orgSlug={orgSlug}
      catalogSlug={catalogSlug}
      telegramBotUsername={telegramBotUsername}
      open={secureOpen}
      onOpenChange={setSecureOpen}
    />
  );

  return (
    <>
    <section
      aria-label={t("activation.checklist.aria")}
      className={cn(
        CORNER,
        "w-[min(20rem,calc(100vw-2rem))] overflow-hidden rounded-lg border bg-background/95 shadow-sm backdrop-blur-md",
        "animate-in fade-in-0 slide-in-from-bottom-2 duration-200",
      )}
    >
      <header className="flex items-center gap-1 border-b py-2 pl-4 pr-2">
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-medium">{t("activation.checklist.title")}</h2>
          <p className="text-xs text-muted-foreground">
            <span className="font-mono tabular-nums">
              {doneCount}/{entries.length}
            </span>{" "}
            {t("activation.checklist.done_hint")}
          </p>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-8 text-muted-foreground"
          onClick={collapse}
          aria-label={t("activation.checklist.collapse_aria")}
        >
          <ChevronDown className="size-4" />
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
              {(entry.href || entry.action) && !entry.done ? (
                <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
              ) : null}
            </span>
          );
          const interactiveClass =
            "block w-full transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
          return (
            <li key={entry.key} className="border-b last:border-b-0">
              {entry.action === "secure" && !entry.done ? (
                <button
                  type="button"
                  onClick={() => setSecureOpen(true)}
                  className={interactiveClass}
                >
                  {row}
                </button>
              ) : entry.href && !entry.done ? (
                <Link href={entry.href} className={interactiveClass}>
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
    {secureDialog}
    </>
  );
}
