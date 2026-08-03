"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { useT } from "@/lib/locales/context";
import { TEST_CARDS, formatPan } from "./test-cards-data";
import { cn } from "@/lib/utils";

/**
 * The card table.
 *
 * Copy-to-clipboard on the PAN because the whole point of the page is that
 * somebody is about to type it into a checkout on another tab — making them
 * select 16 digits by hand would defeat the convenience it exists for.
 */
export function TestCardList() {
  const t = useT();
  const [copied, setCopied] = useState<string | null>(null);

  if (TEST_CARDS.length === 0) return null;

  async function copy(pan: string) {
    try {
      await navigator.clipboard.writeText(pan);
      setCopied(pan);
      setTimeout(() => setCopied(null), 1800);
    } catch {
      // Clipboard is permission-gated; the number is on screen either way.
    }
  }

  return (
    <div className="overflow-x-auto rounded-lg border">
      <table className="w-full text-sm">
        <thead className="border-b bg-muted/40 text-left">
          <tr>
            <th className="px-3 py-2 font-medium">{t("testCards.column.card")}</th>
            <th className="px-3 py-2 font-medium">{t("testCards.column.expiry")}</th>
            <th className="px-3 py-2 font-medium">{t("testCards.column.otp")}</th>
            <th className="px-3 py-2 font-medium">{t("testCards.column.outcome")}</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {TEST_CARDS.map((card) => (
            <tr key={`${card.provider}-${card.pan}`}>
              <td className="px-3 py-2">
                <button
                  type="button"
                  onClick={() => copy(card.pan)}
                  className="inline-flex items-center gap-2 font-mono tabular-nums transition-colors hover:text-foreground"
                  aria-label={t("testCards.copy")}
                >
                  {formatPan(card.pan)}
                  {copied === card.pan ? (
                    <Check className="size-3.5 text-emerald-600 dark:text-emerald-400" aria-hidden />
                  ) : (
                    <Copy className="size-3.5 text-muted-foreground" aria-hidden />
                  )}
                </button>
              </td>
              <td className="px-3 py-2 font-mono tabular-nums text-muted-foreground">
                {card.expiry}
              </td>
              <td className="px-3 py-2 font-mono tabular-nums text-muted-foreground">
                {card.otp ?? "—"}
              </td>
              <td
                className={cn(
                  "px-3 py-2 text-xs",
                  card.outcomeKey === "success"
                    ? "text-emerald-600 dark:text-emerald-400"
                    : "text-muted-foreground",
                )}
              >
                {t(`testCards.outcome.${card.outcomeKey}` as never)}
                {card.note ? <span className="block opacity-70">{card.note}</span> : null}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
