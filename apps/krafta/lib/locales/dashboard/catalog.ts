/**
 * catalog.ts — assembles the per-namespace dashboard catalogs into three flat
 * lookup tables (en / ru / uz-Latn) and derives the message-key union.
 *
 * Why per-namespace files instead of one giant object: the dashboard has
 * hundreds of strings across ~a dozen route sections. Splitting by section
 * keeps each file reviewable and lets multiple people (or agents) translate
 * different surfaces without stepping on each other. This file is the only
 * place that knows about all of them.
 *
 * English is canonical: `keyof typeof EN` defines DashboardMessageKey. The ru
 * / uz-Latn tables are typed `Partial<Record<DashboardMessageKey, string>>`,
 * so a typo'd or stale key in a translation table fails the build, while a
 * *missing* translation is allowed (it falls back to English at runtime).
 *
 * To add a namespace: create `namespaces/<name>.ts` exporting { en, ru,
 * "uz-Latn" }, then import + spread it into all three tables below.
 */

import type { DashboardLocale } from "./locale";
import { common } from "./namespaces/common";
import { nav } from "./namespaces/nav";
import { home } from "./namespaces/home";
import { overview } from "./namespaces/overview";
import { orders } from "./namespaces/orders";
import { items } from "./namespaces/items";
import { categories } from "./namespaces/categories";
import { modifiers } from "./namespaces/modifiers";
import { translations } from "./namespaces/translations";
import { qr } from "./namespaces/qr";
import { studio } from "./namespaces/studio";
import { billing } from "./namespaces/billing";
import { settings } from "./namespaces/settings";
import { activation } from "./namespaces/activation";
import { onboarding } from "./namespaces/onboarding";
import { login } from "./namespaces/login";
import { misc } from "./namespaces/misc";

const EN = {
  ...common.en,
  ...nav.en,
  ...home.en,
  ...overview.en,
  ...orders.en,
  ...items.en,
  ...categories.en,
  ...modifiers.en,
  ...translations.en,
  ...qr.en,
  ...studio.en,
  ...billing.en,
  ...settings.en,
  ...activation.en,
  ...onboarding.en,
  ...login.en,
  ...misc.en,
};

/** Every dashboard message key. Adding a key to any namespace's `en` table
 *  widens this union automatically. */
export type DashboardMessageKey = keyof typeof EN;

const RU: Partial<Record<DashboardMessageKey, string>> = {
  ...common.ru,
  ...nav.ru,
  ...home.ru,
  ...overview.ru,
  ...orders.ru,
  ...items.ru,
  ...categories.ru,
  ...modifiers.ru,
  ...translations.ru,
  ...qr.ru,
  ...studio.ru,
  ...billing.ru,
  ...settings.ru,
  ...activation.ru,
  ...onboarding.ru,
  ...login.ru,
  ...misc.ru,
};

const UZ_LATN: Partial<Record<DashboardMessageKey, string>> = {
  ...common["uz-Latn"],
  ...nav["uz-Latn"],
  ...home["uz-Latn"],
  ...overview["uz-Latn"],
  ...orders["uz-Latn"],
  ...items["uz-Latn"],
  ...categories["uz-Latn"],
  ...modifiers["uz-Latn"],
  ...translations["uz-Latn"],
  ...qr["uz-Latn"],
  ...studio["uz-Latn"],
  ...billing["uz-Latn"],
  ...settings["uz-Latn"],
  ...activation["uz-Latn"],
  ...onboarding["uz-Latn"],
  ...login["uz-Latn"],
  ...misc["uz-Latn"],
};

/** Per-locale lookup tables. English is the complete source; ru / uz-Latn may
 *  be partial and fall back to English per key. */
export const DASHBOARD_MESSAGES: Record<
  DashboardLocale,
  Partial<Record<DashboardMessageKey, string>>
> = {
  en: EN,
  ru: RU,
  "uz-Latn": UZ_LATN,
};
