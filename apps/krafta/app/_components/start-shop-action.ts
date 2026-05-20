"use server";

import { redirect } from "next/navigation";

import { createDraftShopForAnonUser } from "@/lib/auth/merchant-shop";

// KRA-41 — homepage "Create your shop" CTA. Signs the visitor in
// anonymously, provisions a draft shop, redirects to the merchant
// dashboard for that shop. On a later register/login the same auth.uid
// claims the shop via linkIdentity (KRA-43 wires the UI for that).
export async function startShopAction(): Promise<void> {
  const shop = await createDraftShopForAnonUser();
  redirect(`/dashboard/${shop.orgSlug}/${shop.catalogSlug}`);
}
