"use client";

import { useState } from "react";
import { Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { PayLink } from "@/components/dashboard/pay-link.client";
import { useT } from "@/lib/locales/context";
import { startSubscriptionForCustomer } from "../start-subscription.action";

export type PlanOption = {
  id: string;
  label: string;
};

/**
 * "Bill this person."
 *
 * Deliberately on the customer page rather than as a picker bolted onto the
 * Subscriptions form. The merchant's question is «сколько Азиз должен», and
 * they arrive here already thinking about one person — asking them to go
 * somewhere else and re-identify that person by email is how they ended up with
 * two of them.
 *
 * A native select, matching the plan field on the Subscriptions page it mirrors.
 * A merchant has a handful of plans, not a searchable catalogue, and this way
 * the control works identically in both places.
 *
 * The link appears in place instead of navigating, because the merchant's next
 * move is to paste it into Telegram and they want to see what they are sending.
 */
export function StartSubscription({
  orgSlug,
  customerId,
  plans,
}: {
  orgSlug: string;
  customerId: string;
  plans: PlanOption[];
}) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [planId, setPlanId] = useState(plans[0]?.id ?? "");
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  if (plans.length === 0) return null;

  async function submit() {
    setPending(true);
    setError(null);
    try {
      const result = await startSubscriptionForCustomer(orgSlug, customerId, planId);
      if (result.ok) {
        setUrl(result.url);
        setOpen(false);
      } else {
        setError(t("customer.startSub.error"));
      }
    } catch {
      setError(t("customer.startSub.error"));
    } finally {
      setPending(false);
    }
  }

  if (url) {
    return (
      <div className="space-y-1.5 rounded-lg border p-3">
        <p className="text-sm font-medium">{t("subscriptions.created.title")}</p>
        <PayLink url={url} className="bg-background" />
        <p className="text-xs text-muted-foreground">{t("customer.startSub.hint")}</p>
      </div>
    );
  }

  if (!open) {
    return (
      <div className="space-y-1.5">
        <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
          <Plus className="size-4" aria-hidden />
          {t("customer.startSub.cta")}
        </Button>
        {error ? <p className="text-xs text-destructive">{error}</p> : null}
      </div>
    );
  }

  return (
    <div className="space-y-2 rounded-lg border p-3">
      <div className="flex flex-wrap items-end gap-2">
        <div className="grid min-w-56 flex-1 gap-1.5">
          <label
            className="text-xs font-medium text-muted-foreground"
            htmlFor="start-sub-plan"
          >
            {t("subscriptions.form.plan")}
          </label>
          <select
            id="start-sub-plan"
            value={planId}
            onChange={(e) => setPlanId(e.target.value)}
            className="h-9 w-full rounded-md border bg-background px-3 text-base md:text-sm"
          >
            {plans.map((plan) => (
              <option key={plan.id} value={plan.id}>
                {plan.label}
              </option>
            ))}
          </select>
        </div>
        <Button size="sm" onClick={() => void submit()} disabled={pending || !planId}>
          {pending ? t("customer.startSub.creating") : t("subscriptions.form.submit")}
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            setOpen(false);
            setError(null);
          }}
          disabled={pending}
        >
          {t("customer.name.cancel")}
        </Button>
      </div>
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
    </div>
  );
}
