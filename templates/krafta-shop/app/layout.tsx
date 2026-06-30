import "./globals.css";
import type { Metadata } from "next";
import type { ReactNode } from "react";
import { GeistSans } from "geist/font/sans";
import type { Currency, OrderMode } from "@krafta/commerce";

import { commerce } from "@/lib/commerce";
import { CartProvider } from "@/components/commerce/cart-provider";
import { CartDrawer } from "@/components/commerce/cart-drawer";

export const metadata: Metadata = {
  title: "Shop",
  description: "Powered by Krafta.",
};

// Render every page at request time so the live shop always reflects the
// current catalog (and so `next build` never tries to fetch the catalog at
// build time). Keep this — it's what makes the deployed shop stay in sync with
// the merchant's commerce data. Applies to all routes under this layout.
export const dynamic = "force-dynamic";

export default async function RootLayout({ children }: { children: ReactNode }) {
  // The cart provider needs the shop's currency + enabled order modes. Read
  // them once here so the cart, checkout, and badge are configured app-wide.
  // If the catalog can't be read (e.g. the key isn't set yet), the chrome still
  // mounts — each page surfaces its own catalog error.
  let currency: Currency = { code: "", label: "" };
  let orderModes: OrderMode[] = [];
  try {
    const catalog = await commerce.getCatalog();
    currency = catalog.currency;
    orderModes = catalog.orderModes;
  } catch {
    // Leave the defaults; the shop's pages will report the failure.
  }

  return (
    <html lang="en" className={GeistSans.className}>
      <body className="min-h-screen antialiased">
        <CartProvider currency={currency} orderModes={orderModes}>
          {children}
          <CartDrawer />
        </CartProvider>
      </body>
    </html>
  );
}
