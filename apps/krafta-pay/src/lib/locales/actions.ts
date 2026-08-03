"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { PAY_LOCALE_COOKIE, normalizePayLocale } from "./locale";

/**
 * Persist a switcher choice.
 *
 * A year, because a merchant's language is not a session preference — and
 * httpOnly is deliberately off so the choice survives a client-side navigation
 * without a round trip.
 */
export async function setPayLocaleAction(value: string) {
  const locale = normalizePayLocale(value);
  if (!locale) return;

  const store = await cookies();
  store.set(PAY_LOCALE_COOKIE, locale, {
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
    sameSite: "lax",
  });
  revalidatePath("/", "layout");
}
