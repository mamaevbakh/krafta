import type { Metadata } from "next";

import { ResultCardWidget } from "@/components/lab/widgets/result-card";
import { ItemConfiguratorWidget } from "@/components/lab/widgets/item-configurator";
import { CartWidget } from "@/components/lab/widgets/cart-widget";
import { ModePickerWidget } from "@/components/lab/widgets/mode-picker";
import { ScheduleQuestionWidget } from "@/components/lab/widgets/schedule-question";
import { TableQuestionWidget } from "@/components/lab/widgets/table-question";
import { ContactQuestionWidget } from "@/components/lab/widgets/contact-question";
import { AddressMapWidget } from "@/components/lab/widgets/address-map";
import { TipWidget } from "@/components/lab/widgets/tip-selector";
import { CheckoutReviewWidget } from "@/components/lab/widgets/checkout-review";
import { OrderConfirmationWidget } from "@/components/lab/widgets/order-confirmation";
import { OrderStatusWidget } from "@/components/lab/widgets/order-status";
import { DeliveryTrackingWidget } from "@/components/lab/widgets/delivery-tracking";
import { ShopInfoWidget } from "@/components/lab/widgets/shop-info";

export const metadata: Metadata = {
  title: "Widget gallery — Krafta",
  robots: { index: false, follow: false },
};

function Cell({ tag, children }: { tag: string; children: React.ReactNode }) {
  return (
    <div className="mb-4 break-inside-avoid">
      {children}
      <p className="mt-1.5 px-1 font-mono text-[11px] text-muted-foreground">
        {tag}
      </p>
    </div>
  );
}

// The customer ordering flow, in order: discover → configure → cart → mode →
// questions → address → tip → review → confirm → post-order. Every widget is
// composed from shadcn primitives; no gradients, no decorative color.
const CELLS: { tag: string; node: React.ReactNode }[] = [
  { tag: "result_card", node: <ResultCardWidget /> },
  { tag: "item_configurator", node: <ItemConfiguratorWidget /> },
  { tag: "cart", node: <CartWidget /> },
  { tag: "mode_picker", node: <ModePickerWidget /> },
  { tag: "schedule_question", node: <ScheduleQuestionWidget /> },
  { tag: "table_question", node: <TableQuestionWidget /> },
  { tag: "contact_question", node: <ContactQuestionWidget /> },
  { tag: "address_map", node: <AddressMapWidget /> },
  { tag: "tip", node: <TipWidget /> },
  { tag: "checkout_review", node: <CheckoutReviewWidget /> },
  { tag: "order_confirmation", node: <OrderConfirmationWidget /> },
  { tag: "order_status", node: <OrderStatusWidget /> },
  { tag: "delivery_tracking", node: <DeliveryTrackingWidget /> },
  { tag: "shop_info", node: <ShopInfoWidget /> },
];

export default function WidgetGalleryPage() {
  return (
    <main className="mx-auto max-w-[1248px] px-6 py-10">
      <header className="mb-8 max-w-2xl">
        <h1 className="text-[32px] font-semibold tracking-tight">
          Widget gallery
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          The Krafta ordering-flow widgets — the ones the assistant renders plus
          new variants for the same flow. All composed from shadcn primitives in
          our system: monochrome, Geist with mono numerals, UZS prices, no
          gradients or decorative color.
        </p>
      </header>

      <div className="columns-1 gap-4 sm:columns-2 lg:columns-3 xl:columns-4">
        {CELLS.map((c) => (
          <Cell key={c.tag} tag={c.tag}>
            {c.node}
          </Cell>
        ))}
      </div>
    </main>
  );
}
