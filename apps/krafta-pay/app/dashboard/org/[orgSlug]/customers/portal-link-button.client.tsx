"use client";

import { useState } from "react";
import { ExternalLink } from "lucide-react";

import { Button } from "@/components/ui/button";
import { PayLink } from "@/components/dashboard/pay-link.client";
import { useT } from "@/lib/locales/context";
import { createCustomerPortalLink } from "./portal-link.action";

/**
 * "Send this customer a link to manage their own billing."
 *
 * The link appears in place rather than being copied straight to the clipboard,
 * because a merchant pasting into Telegram wants to see what they are about to
 * send — the same reason PayLink shows the URL in full. Reusing PayLink also
 * means copy, open and their translations already work here.
 *
 * Minting is deliberately on click, not on page load. Every mint is a live
 * bearer token for this person's billing history, and a page that quietly
 * created one every time a merchant glanced at a customer would leave a trail
 * of valid links nobody ever sent.
 */
export function PortalLinkButton({
  orgSlug,
  customerId,
}: {
  orgSlug: string;
  customerId: string;
}) {
  const t = useT();
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onClick() {
    setPending(true);
    setError(null);
    try {
      const result = await createCustomerPortalLink(orgSlug, customerId);
      if (result.ok) setUrl(result.url);
      else setError(t("customer.portal.error"));
    } catch {
      setError(t("customer.portal.error"));
    } finally {
      setPending(false);
    }
  }

  if (url) {
    return (
      <div className="space-y-1.5">
        <PayLink url={url} className="bg-background" />
        <p className="text-xs text-muted-foreground">{t("customer.portal.hint")}</p>
      </div>
    );
  }

  return (
    <div className="space-y-1.5">
      <Button variant="outline" size="sm" onClick={onClick} disabled={pending}>
        <ExternalLink className="size-4" />
        {t("customer.portal.create")}
      </Button>
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
    </div>
  );
}
