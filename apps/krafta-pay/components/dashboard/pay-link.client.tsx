"use client";

import { useState } from "react";
import { Check, Copy, ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * A checkout link the merchant has to hand to a customer themselves.
 *
 * Krafta Pay sends no email and no SMS — the "customer email" on a subscription
 * identifies the customer record, it does not deliver anything. That makes this
 * link the entire delivery mechanism, so it is built to be copied: one click,
 * with the URL still shown in full because merchants paste these into Telegram
 * and want to see what they are pasting.
 *
 * Used both right after creation and on every unpaid subscription in the list,
 * because the copy that appeared once on a redirect used to be the only copy.
 */
export function PayLink({
  url,
  className,
  compact,
}: {
  url: string;
  className?: string;
  compact?: boolean;
}) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // Clipboard access is permission-gated; the URL is on screen anyway.
    }
  }

  return (
    <div
      className={cn(
        "flex items-center gap-1 rounded-md border bg-muted/30 py-1 pl-2.5 pr-1",
        className,
      )}
    >
      <span
        className={cn(
          "min-w-0 flex-1 truncate font-mono text-muted-foreground",
          compact ? "text-[11px]" : "text-xs",
        )}
        title={url}
      >
        {url}
      </span>

      <button
        type="button"
        onClick={copy}
        aria-label={copied ? "Copied" : "Copy payment link"}
        className={cn(
          "inline-flex shrink-0 items-center gap-1 rounded px-1.5 py-1 text-xs font-medium transition-colors",
          copied
            ? "text-emerald-600 dark:text-emerald-400"
            : "text-muted-foreground hover:text-foreground",
        )}
      >
        {copied ? (
          <Check className="size-3.5" aria-hidden />
        ) : (
          <Copy className="size-3.5" aria-hidden />
        )}
        {compact ? null : <span>{copied ? "Copied" : "Copy"}</span>}
      </button>

      <a
        href={url}
        target="_blank"
        rel="noreferrer"
        aria-label="Open payment page"
        className="inline-flex shrink-0 items-center rounded px-1.5 py-1 text-muted-foreground transition-colors hover:text-foreground"
      >
        <ExternalLink className="size-3.5" aria-hidden />
      </a>
    </div>
  );
}
