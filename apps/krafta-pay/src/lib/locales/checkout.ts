import "server-only";

import { headers } from "next/headers";
import type { SupabaseClient } from "@supabase/supabase-js";
import { normalizePayLocale, resolvePayLocale, type PayLocale } from "./locale";
import { createTranslator, type TranslateFn } from "./messages";

/**
 * Locale for the hosted checkout — a DIFFERENT question from the dashboard's.
 *
 * The dashboard asks "what language does this merchant read", and answers it
 * from a cookie the merchant set. The checkout asks "what language does this
 * merchant's *customer* read", and the merchant's cookie is worthless for that:
 * a Tashkent gym owner who runs their console in English still has customers
 * who need to be told «Срок действия карты» before typing one in.
 *
 * Resolution order, most explicit first:
 *
 *   1. `?lang=` on the pay URL — the merchant deciding per link. A bot that
 *      knows its subscriber's language can append it.
 *   2. `locale` in the checkout session metadata — the merchant deciding per
 *      customer at API call time, which survives the customer sharing the link.
 *   3. The customer's own Accept-Language.
 *   4. Russian.
 *
 * There is deliberately no cookie here. A checkout is opened once, usually from
 * a message, often on a device that has never seen us before — a persisted
 * preference has nothing to persist from.
 */
export async function resolveCheckoutLocale(params: {
  langParam?: string | null;
  sessionMetadata?: unknown;
}): Promise<PayLocale> {
  const fromParam = normalizePayLocale(params.langParam);
  if (fromParam) return fromParam;

  const metadata =
    params.sessionMetadata && typeof params.sessionMetadata === "object"
      ? (params.sessionMetadata as Record<string, unknown>)
      : null;
  const fromMetadata = normalizePayLocale(
    typeof metadata?.locale === "string" ? metadata.locale : null,
  );
  if (fromMetadata) return fromMetadata;

  const headerStore = await headers();
  return resolvePayLocale({ acceptLanguage: headerStore.get("accept-language") });
}

export async function getCheckoutT(params: {
  langParam?: string | null;
  sessionMetadata?: unknown;
}): Promise<{ locale: PayLocale; t: TranslateFn }> {
  const locale = await resolveCheckoutLocale(params);
  return { locale, t: createTranslator(locale) };
}

/**
 * Load just enough of a checkout session to resolve its locale.
 *
 * Used by the success / failure callback pages, which render before they have
 * loaded anything else and would otherwise fall back to Accept-Language and
 * contradict the language the customer was just paying in.
 */
export async function resolveCheckoutLocaleByToken(
  supabase: SupabaseClient,
  publicToken: string,
  langParam?: string | null,
): Promise<{ locale: PayLocale; t: TranslateFn }> {
  const { data } = await supabase
    .schema("payments")
    .from("checkout_sessions")
    .select("metadata")
    .eq("public_token", publicToken)
    .maybeSingle();

  return getCheckoutT({ langParam, sessionMetadata: data?.metadata });
}
