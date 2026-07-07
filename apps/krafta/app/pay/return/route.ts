import { NextResponse } from "next/server";
import { confirmOrderCardPayment } from "@/lib/payments/settings";

// Where the Krafta Pay hosted page sends the customer after an online (card)
// order payment. We confirm the charge server-side against Krafta Pay, settle
// the local order_payments mirror, then bounce the customer back to the shop.
// Reachable on any shop host because this static segment beats the storefront
// [...slug] catch-all.

function safeReturnPath(raw: string | null): string {
  // Only allow same-origin relative paths — never an absolute URL (open redirect).
  if (!raw || !raw.startsWith("/") || raw.startsWith("//")) return "/";
  return raw;
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const orderId = url.searchParams.get("order");
  const to = safeReturnPath(url.searchParams.get("to"));
  const dest = new URL(to, url.origin);

  if (!orderId) {
    return NextResponse.redirect(dest);
  }

  let status: string = "pending";
  try {
    status = await confirmOrderCardPayment(orderId);
  } catch {
    status = "pending";
  }

  // Surface the outcome to the storefront so it can show a receipt / retry hint.
  dest.searchParams.set("pay", status);
  dest.searchParams.set("order", orderId);
  return NextResponse.redirect(dest);
}
