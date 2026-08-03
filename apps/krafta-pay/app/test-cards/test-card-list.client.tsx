"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { useT } from "@/lib/locales/context";
import { cardsByProvider, formatPan, type TestCard } from "./test-cards-data";
import { cn } from "@/lib/utils";

/**
 * Test cards, grouped by provider.
 *
 * Copy-to-clipboard on the PAN and the OTP, because the entire point of this
 * page is that someone is about to type them into a checkout in another tab.
 * Making them select sixteen digits by hand would defeat the convenience it
 * exists for.
 */
export function TestCardList() {
  const t = useT();
  const [copied, setCopied] = useState<string | null>(null);
  const groups = cardsByProvider();

  async function copy(value: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(value);
      setTimeout(() => setCopied(null), 1800);
    } catch {
      // Clipboard access is permission-gated; the value is on screen anyway.
    }
  }

  return (
    <div className="space-y-6">
      {groups.map(({ source, cards }) => (
        <section key={source.provider} className="space-y-2">
          <h2 className="text-sm font-medium">{source.name}</h2>
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
                {cards.map((card) => (
                  <Row
                    key={card.pan}
                    card={card}
                    copied={copied}
                    onCopy={copy}
                    t={t}
                  />
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ))}
    </div>
  );
}

function Row({
  card,
  copied,
  onCopy,
  t,
}: {
  card: TestCard;
  copied: string | null;
  onCopy: (value: string) => void;
  t: ReturnType<typeof useT>;
}) {
  const succeeds = card.outcomeKey === "success";

  return (
    <tr>
      <td className="px-3 py-2">
        <CopyButton value={card.pan} label={formatPan(card.pan)} copied={copied} onCopy={onCopy} />
        {card.scheme ? (
          <span className="mt-0.5 block text-[11px] text-muted-foreground">{card.scheme}</span>
        ) : null}
      </td>
      <td className="whitespace-nowrap px-3 py-2 font-mono tabular-nums text-muted-foreground">
        {card.expiry}
      </td>
      <td className="px-3 py-2">
        <CopyButton value={card.otp} label={card.otp} copied={copied} onCopy={onCopy} muted />
      </td>
      <td
        className={cn(
          "px-3 py-2 text-xs",
          succeeds ? "text-emerald-600 dark:text-emerald-400" : "text-amber-600 dark:text-amber-400",
        )}
      >
        {t(`testCards.outcome.${card.outcomeKey}` as never)}
      </td>
    </tr>
  );
}

function CopyButton({
  value,
  label,
  copied,
  onCopy,
  muted,
}: {
  value: string;
  label: string;
  copied: string | null;
  onCopy: (value: string) => void;
  muted?: boolean;
}) {
  const t = useT();
  const isCopied = copied === value;

  return (
    <button
      type="button"
      onClick={() => onCopy(value)}
      aria-label={isCopied ? t("testCards.copied") : t("testCards.copy")}
      className={cn(
        "inline-flex items-center gap-2 whitespace-nowrap font-mono tabular-nums transition-colors hover:text-foreground",
        muted && "text-muted-foreground",
      )}
    >
      {label}
      {isCopied ? (
        <Check className="size-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" aria-hidden />
      ) : (
        <Copy className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
      )}
    </button>
  );
}
