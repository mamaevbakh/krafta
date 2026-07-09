import { Button } from "@/components/ui/button";
import { CreditCard, Clock3 } from "lucide-react";
import {
  cancelSubscriptionAction,
  changeSubscriptionCardAction,
} from "./subscription-actions";

/**
 * SubscriptionManager — first-party "change card" + "cancel/resume" controls on
 * the billing page. Rendered only when the org has a live subscription. Change
 * card sends the merchant to the Krafta Pay Atmos card form (bind a new card as
 * the renewal default, no charge); cancel schedules at period end (→ drop to
 * Free), resume clears a pending cancel.
 */
export function SubscriptionManager({
  orgId,
  orgSlug,
  catalogSlug,
  subscriptionId,
  cancelAtPeriodEnd,
}: {
  orgId: string;
  orgSlug: string;
  catalogSlug: string;
  subscriptionId: string | null;
  cancelAtPeriodEnd: boolean;
}) {
  if (!subscriptionId) return null;

  const hidden = (
    <>
      <input type="hidden" name="customerOrgId" value={orgId} />
      <input type="hidden" name="orgSlug" value={orgSlug} />
      <input type="hidden" name="catalogSlug" value={catalogSlug} />
      <input type="hidden" name="subscriptionId" value={subscriptionId} />
    </>
  );

  return (
    <div className="flex flex-col gap-2 sm:flex-row">
      <form action={changeSubscriptionCardAction}>
        {hidden}
        <Button type="submit" variant="outline" className="w-full sm:w-auto">
          <CreditCard className="size-4" />
          Change card
        </Button>
      </form>
      <form action={cancelSubscriptionAction}>
        {hidden}
        <input type="hidden" name="resume" value={cancelAtPeriodEnd ? "true" : "false"} />
        <Button
          type="submit"
          variant={cancelAtPeriodEnd ? "default" : "outline"}
          className="w-full sm:w-auto"
        >
          <Clock3 className="size-4" />
          {cancelAtPeriodEnd ? "Resume subscription" : "Cancel subscription"}
        </Button>
      </form>
    </div>
  );
}
