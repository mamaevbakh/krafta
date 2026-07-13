"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Loader2 } from "lucide-react";

import { useT } from "@/lib/locales/dashboard/context";

/**
 * CheckoutConfirming — the "confirming your payment…" state on the billing page.
 *
 * When a merchant lands back on billing after paying (?checkout=success) but the
 * subscription hasn't flipped to active yet in the DB, this polls by refreshing
 * the server component on a bounded interval so the page updates itself the
 * moment the charge is recorded — instead of showing stale "not subscribed"
 * data until a manual reload.
 *
 * For Atmos the apply route writes the subscription synchronously before the
 * redirect, so this is usually a no-op (parent renders it only when status is
 * still non-active). It exists to cover the window where a write lands just
 * after the redirect, and any future async provider.
 */
const POLL_INTERVAL_MS = 2500;
const MAX_POLLS = 8; // ~20s total, then fall back to a manual refresh prompt.

export function CheckoutConfirming() {
  const t = useT();
  const router = useRouter();
  const [attempts, setAttempts] = useState(0);

  useEffect(() => {
    if (attempts >= MAX_POLLS) return;
    const id = setTimeout(() => {
      router.refresh();
      setAttempts((n) => n + 1);
    }, POLL_INTERVAL_MS);
    return () => clearTimeout(id);
  }, [attempts, router]);

  const exhausted = attempts >= MAX_POLLS;

  return (
    <div className="rounded-lg border border-border bg-muted/30 p-4" role="status" aria-live="polite">
      <div className="flex items-start gap-2">
        {exhausted ? (
          <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
        ) : (
          <Loader2 className="mt-0.5 size-4 shrink-0 animate-spin text-muted-foreground" />
        )}
        <div>
          <p className="font-medium">
            {exhausted
              ? t("billing.banner.confirm_slow_title")
              : t("billing.banner.confirming_title")}
          </p>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {exhausted
              ? t("billing.banner.confirm_slow_desc")
              : t("billing.banner.confirming_desc")}
          </p>
        </div>
      </div>
    </div>
  );
}
