/**
 * Shared client types for the Overview panel and its modules. The full order
 * detail lives on the Orders page; the home only needs enough to run the queue
 * and compute the day metrics.
 */

export type OverviewOrderLine = {
  name: string;
  quantity: number;
  totalPriceCents: number;
};

export type OverviewOrder = {
  id: string;
  state: "draft" | "open" | "completed" | "canceled";
  reference: string;
  ticketName: string | null;
  createdAt: string;
  version: number;
  mode: "dine_in" | "pickup" | "delivery" | "digital" | null;
  fulfillmentId: string | null;
  fulfillmentState:
    | "proposed"
    | "reserved"
    | "prepared"
    | "completed"
    | "canceled"
    | "failed"
    | null;
  customerLabel: string;
  itemCount: number;
  lineItems: OverviewOrderLine[];
};

/** A day's worth of orders reduced to the shape the metric helpers accept. */
export type PriorOrder = {
  state: string;
  createdAt: string;
  lineItems: OverviewOrderLine[];
};
