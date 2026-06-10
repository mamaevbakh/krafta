"use server";

// KRA-42 / ADR 0005 §2 — wizard submit. Ensures an anon session, stamps the
// seeded draft shop (one atomic RPC, idempotent per user), and lands the
// merchant in the Library Canvas. Replaces the pre-wizard start-shop-action
// that created a bare shop straight from the homepage CTA.

import { redirect } from "next/navigation";

import { createDraftShopForAnonUser } from "@/lib/auth/merchant-shop";

import { isShopVertical } from "./verticals";

export type CreateShopState = { error?: string };

export async function createShopFromWizard(
  _prev: CreateShopState,
  formData: FormData,
): Promise<CreateShopState> {
  const vertical = String(formData.get("vertical") ?? "");
  const name = String(formData.get("name") ?? "").trim();

  if (!isShopVertical(vertical)) {
    return { error: "Pick a shop type to continue." };
  }
  if (name.length < 1 || name.length > 80) {
    return { error: "Give your shop a name (up to 80 characters)." };
  }

  let shop;
  try {
    shop = await createDraftShopForAnonUser({ vertical, name });
  } catch (err) {
    console.error("[onboarding] create_draft_shop failed", err);
    return {
      error:
        "We couldn't create your shop just now. Check your connection and try again.",
    };
  }

  redirect(`/dashboard/${shop.orgSlug}/${shop.catalogSlug}/items`);
}
