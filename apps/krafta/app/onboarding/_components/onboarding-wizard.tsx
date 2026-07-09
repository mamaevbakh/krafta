"use client";

// KRA-42 wizard v3 / ADR 0005 §2 (amended) — guided seeding, one decision
// per screen.
//
//   ① type → ② name → ③ logo (optional) → ④ sections → ⑤ items (one screen)
//   → modes → tables (dine-in only) → languages → alerts → phone → city
//   → single submit (complete_wizard RPC) → reveal → Studio.
//
// The step list is computed from draft state, so the screen count adapts to
// the merchant's own menu (a 3-section cafe walks 3 item screens). Progress
// is a slim bar instead of "Step X of Y": the count is dynamic, and a bar
// reads as momentum rather than burden.
//
// Every screen keeps a one-tap fast path: suggestions arrive pre-checked
// from vertical_templates, modes/languages carry vertical defaults, phone
// and city skip. The draft persists to sessionStorage on every change so an
// Android back-gesture or a discarded tab no longer wipes typed prices.
// Nothing is created until the final submit — abandoning mid-wizard leaves
// zero rows.

import * as React from "react";
import Link from "next/link";
import {
  ArrowLeft,
  BookOpen,
  Check,
  ChevronRight,
  FileText,
  ImagePlus,
  Loader2,
  Minus,
  PencilLine,
  Plus,
  Sparkles,
  Upload,
  X,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SignOutButton } from "@/components/auth/sign-out-button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Iphone, IphoneStatusBar } from "@/components/ui/iphone";
import { Label } from "@/components/ui/label";
import { LocalePicker } from "@/components/locales/locale-picker";
import { CurrencyPicker } from "@/components/locales/currency-picker";
import { CountryPicker } from "@/components/locales/country-picker";
import { getLocaleDefinition } from "@/lib/locales/registry";
import { getCurrencyDefaults } from "@/lib/locale/currency-defaults";
import { getCurrencyForCountry } from "@/lib/locale/country-defaults";
import { formatPriceCents } from "@/lib/catalogs/pricing";
import {
  normalizeCurrencySettings,
  type CurrencySettings,
  type CurrencyLabelPosition,
  type ThousandSeparator,
} from "@/lib/catalogs/settings/currency";
import { cn } from "@/lib/utils";

import {
  createShopFromWizard,
  getVerticalSuggestions,
  type WizardPayload,
} from "./actions";
import { extractMenuAction, type ExtractMenuResult } from "./menu-actions";
import type { ExtractedMenu } from "@/lib/menu-extraction/schema";
import { trackWizard } from "./analytics";
import { CITY_CHIPS, fmt, getWizardCopy } from "./copy";
import { ConfettiSideCannons } from "./confetti-side-cannons";
import {
  VERTICALS,
  VERTICAL_KEYS,
  getVerticalCopy,
  isShopVertical,
  type ShopVertical,
  type VenueMode,
} from "./verticals";
import { useDashboardLocale } from "@/lib/locales/dashboard/context";

type ItemDraft = {
  key: string;
  name: string;
  /** Display value in sums (price_cents / 100), kept as string while editing. */
  priceSum: string;
  /** Description from AI menu extraction (menu's original language). Absent for
   *  manually-added / suggestion items. Carried through to the created catalog. */
  description?: string | null;
  /** Sizes from AI extraction (S/M/L, 0.3л/0.5л), each priced. Carried + persisted. */
  variations?: { name: string; price: number | null }[];
  /** Add-on / choice groups from AI extraction. Carried + persisted as modifier lists. */
  modifiers?: {
    name: string;
    required: boolean;
    multiple: boolean;
    options: { name: string; price: number | null }[];
  }[];
  checked: boolean;
  suggestionSlug: string | null;
  suggested: { name: string; priceCents: number } | null;
};

type SectionDraft = {
  key: string;
  name: string;
  checked: boolean;
  suggestionSlug: string | null;
  items: ItemDraft[];
};

type AlertsIntent = "telegram" | "dashboard";

// How the merchant fills their menu. "manual" keeps the curated-template flow;
// "upload" inserts an AI extraction screen that reads photos/PDF into the same
// sections/items state. Two options today — the chooser is built to grow (e.g.
// import from another platform) without touching the step machine.
type MenuMethod = "manual" | "upload";

type Step =
  | { kind: "type" }
  | { kind: "name" }
  | { kind: "country" }
  | { kind: "currency" }
  | { kind: "logo" }
  | { kind: "menu_method" }
  | { kind: "menu_upload" }
  | { kind: "sections" }
  | { kind: "items" }
  | { kind: "modes" }
  | { kind: "tables" }
  | { kind: "languages" }
  | { kind: "alerts" }
  | { kind: "phone" }
  | { kind: "city" };

function buildSteps(
  sections: SectionDraft[],
  modes: VenueMode[],
  menuMethod: MenuMethod | null,
  browseOnly: boolean,
): Step[] {
  const hasItems = sections.some((s) => s.checked);
  return [
    { kind: "type" },
    { kind: "name" },
    // Country first — it anchors the currency default (and later phone/locale
    // hints), so the currency step opens pre-set to the country's money.
    { kind: "country" },
    // Currency is foundational — pick it early so the menu's prices render in
    // the merchant's own currency as they build it.
    { kind: "currency" },
    // Optional logo — sits with the shop's identity, right after its name.
    { kind: "logo" },
    // One decision: build the menu by hand, or upload an existing one.
    { kind: "menu_method" },
    // The upload + AI-read screen only exists on the "upload" path; both paths
    // converge on the sections/items review below.
    ...(menuMethod === "upload" ? [{ kind: "menu_upload" } as Step] : []),
    { kind: "sections" },
    // One items screen for the whole menu — all checked sections stacked.
    ...(hasItems ? [{ kind: "items" } as Step] : []),
    { kind: "modes" },
    // No tables without dine-in (a browse-only catalog clears modes, so this
    // is skipped too).
    ...(modes.includes("dine_in") ? [{ kind: "tables" } as Step] : []),
    { kind: "languages" },
    // A browse-only catalog takes no orders — skip the order-alerts step.
    ...(browseOnly ? [] : [{ kind: "alerts" } as Step]),
    { kind: "phone" },
    { kind: "city" },
  ];
}

// Map an AI-extracted menu onto the wizard's editable draft shape. Prices come
// back in major units (sums) — exactly what ItemDraft.priceSum holds — so they
// flow straight into the review screen and the existing submit path. A module
// counter keeps React keys stable and distinct from template/custom keys.
let aiKeySeq = 0;
function sectionsFromExtraction(menu: ExtractedMenu): SectionDraft[] {
  return menu.sections
    .filter((s) => s.name.trim() && s.items.length > 0)
    // Clamp to the wizard's submit caps so a big uploaded menu can never
    // overflow the schema (50 categories / 100 items per category).
    .slice(0, 50)
    .map((s) => ({
      key: `ai-s-${aiKeySeq++}`,
      name: s.name.trim(),
      checked: true,
      suggestionSlug: null,
      items: s.items
        .filter((i) => i.name.trim())
        .slice(0, 100)
        .map((i) => ({
          key: `ai-i-${aiKeySeq++}`,
          name: i.name.trim(),
          priceSum:
            i.price != null && i.price > 0
              ? String(Math.round(i.price))
              : i.variations?.[0]?.price != null && i.variations[0].price > 0
                ? String(Math.round(i.variations[0].price))
                : "",
          description: i.description?.trim().slice(0, 500) || null,
          variations: (i.variations ?? [])
            .filter((v) => v.name?.trim())
            .slice(0, 20)
            .map((v) => ({ name: v.name.trim().slice(0, 64), price: v.price ?? null })),
          modifiers: (i.modifiers ?? [])
            .filter(
              (m) => m.name?.trim() && (m.options ?? []).some((o) => o.name?.trim()),
            )
            .slice(0, 10)
            .map((m) => ({
              name: m.name.trim().slice(0, 64),
              required: !!m.required,
              multiple: !!m.multiple,
              options: (m.options ?? [])
                .filter((o) => o.name?.trim())
                .slice(0, 30)
                .map((o) => ({ name: o.name.trim().slice(0, 64), price: o.price ?? null })),
            })),
          checked: true,
          suggestionSlug: null,
          suggested: null,
        })),
    }));
}

function parseSum(value: string): number {
  const n = Number(value.replace(/[^\d]/g, ""));
  return Number.isFinite(n) ? Math.min(n, 10_000_000) : 0;
}

/** UZS always renders with space thousands separators (DESIGN.md i18n). */
function formatSum(digits: string): string {
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, " ");
}

// Downscale a photo to a max dimension + re-encode as JPEG before upload. Keeps
// a 20-photo batch small enough for the server-action body cap and quick to
// upload over mobile, with no loss of menu legibility. PDFs, undecodable formats
// (e.g. HEIC on non-Safari browsers — the server converts those), and files that
// don't shrink pass through unchanged.
async function compressImageFile(file: File): Promise<File> {
  if (file.type === "application/pdf" || /\.pdf$/i.test(file.name)) return file;
  if (typeof createImageBitmap !== "function") return file;
  try {
    const bitmap = await createImageBitmap(file);
    const maxDim = 2000;
    const scale = Math.min(1, maxDim / Math.max(bitmap.width, bitmap.height));
    const w = Math.max(1, Math.round(bitmap.width * scale));
    const h = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      bitmap.close();
      return file;
    }
    ctx.drawImage(bitmap, 0, 0, w, h);
    bitmap.close();
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", 0.82),
    );
    if (!blob || blob.size >= file.size) return file;
    const base = file.name.replace(/\.[^.]+$/, "") || "photo";
    return new File([blob], `${base}.jpg`, { type: "image/jpeg" });
  } catch {
    return file;
  }
}

// ── draft persistence ─────────────────────────────────────────────────────────
//
// sessionStorage, not localStorage: scoped to the tab (a shared device at the
// counter doesn't leak one merchant's draft into another's session) and
// cleared when the tab closes — exactly the reload/back-gesture window we
// need to survive.

const DRAFT_KEY = "krafta.wizard.draft.v1";

type WizardDraft = {
  v: 1;
  cursor: number;
  vertical: ShopVertical | null;
  name: string;
  sections: SectionDraft[];
  modes: VenueMode[];
  /** Browse-only ("just a catalog") — no order modes, cart disabled. */
  browseOnly?: boolean;
  /** Per-shop currency + formatting; absent in pre-currency drafts → UZS. */
  currency?: CurrencySettings;
  /** Country of operation (ISO 3166-1 alpha-2); absent in pre-country drafts → "UZ". */
  country?: string;
  tableCount: number;
  locales: { code: string; isDefault: boolean }[];
  /** Order-alerts preference; absent in pre-PR3 drafts → "telegram". */
  alertsIntent?: AlertsIntent;
  /** Menu-build choice; absent in pre-upload drafts → null (re-asks). */
  menuMethod?: MenuMethod | null;
  phone: string;
  city: string;
  customCity: boolean;
};

/** Minimum time the building theater stays on screen — the staged labels
 *  need a beat each even when the RPC finishes in under two seconds. */
const BUILDING_MIN_MS = 2600;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function OnboardingWizard() {
  // Merchant UI locale (cookie → Accept-Language → ru), provided by the
  // DashboardLocaleProvider wrapped around /onboarding in page.tsx. All wizard
  // copy + vertical display strings resolve through it.
  const locale = useDashboardLocale();
  const copy = getWizardCopy(locale);
  const verticalCopy = getVerticalCopy(locale);
  const [hydrated, setHydrated] = React.useState(false);
  const [cursor, setCursor] = React.useState(0);
  const [vertical, setVertical] = React.useState<ShopVertical | null>(null);
  const [name, setName] = React.useState("");
  // Optional logo. Held client-side as a File until submit, then uploaded once
  // the catalog exists (POST /api/catalogs/logo). Not part of the saved draft —
  // File objects aren't serializable, so a reload returns to an empty picker.
  const [logoFile, setLogoFile] = React.useState<File | null>(null);
  const [logoPreview, setLogoPreview] = React.useState<string | null>(null);
  const logoInputRef = React.useRef<HTMLInputElement>(null);
  const logoUrlRef = React.useRef<string | null>(null);
  const pickLogo = React.useCallback((file: File | null) => {
    if (logoUrlRef.current) URL.revokeObjectURL(logoUrlRef.current);
    const url = file ? URL.createObjectURL(file) : null;
    logoUrlRef.current = url;
    setLogoPreview(url);
    setLogoFile(file);
  }, []);
  // Revoke the last object URL when the wizard unmounts.
  React.useEffect(
    () => () => {
      if (logoUrlRef.current) URL.revokeObjectURL(logoUrlRef.current);
    },
    [],
  );
  const [sections, setSections] = React.useState<SectionDraft[]>([]);
  // Menu-build choice + the "upload" path's state. Files are held client-side
  // until extraction (not in the saved draft — File objects aren't
  // serializable), mirroring the logo screen.
  const [menuMethod, setMenuMethod] = React.useState<MenuMethod | null>(null);
  const [menuFiles, setMenuFiles] = React.useState<File[]>([]);
  const [extracting, setExtracting] = React.useState(false);
  const menuInputRef = React.useRef<HTMLInputElement>(null);
  const [modes, setModes] = React.useState<VenueMode[]>(["pickup"]);
  // Browse-only ("just a catalog") — mutually exclusive with the order modes.
  const [browseOnly, setBrowseOnly] = React.useState(false);
  const [tableCount, setTableCount] = React.useState(8);
  // Country of operation. Anchors the currency default (and later phone country
  // code / locale hints). Defaults to UZ — Krafta's home market → UZS.
  const [country, setCountry] = React.useState<string>("UZ");
  // Per-shop currency + formatting. Defaults to UZS (Krafta's home market);
  // the currency step lets a merchant switch to any currency for another
  // country and fine-tune the format.
  const [currency, setCurrency] = React.useState<CurrencySettings>(() =>
    getCurrencyDefaults("UZS"),
  );
  const [locales, setLocales] = React.useState<
    { code: string; isDefault: boolean }[]
  >([
    { code: "ru", isDefault: true },
    { code: "uz-Latn", isDefault: false },
    { code: "en", isDefault: false },
  ]);
  const [phone, setPhone] = React.useState("");
  const [city, setCity] = React.useState("");
  const [customCity, setCustomCity] = React.useState(false);
  const [alertsIntent, setAlertsIntent] = React.useState<AlertsIntent>("telegram");
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  // Which final-screen button kicked off the submit — the busy spinner must
  // sit on the button the merchant actually pressed.
  const [submitVia, setSubmitVia] = React.useState<"create" | "skip" | null>(null);
  // form → building (submit in flight, theater playing) → reveal (shop
  // exists; phone-frame preview + dashboard CTA). Failures fall back to
  // "form" with the error on the city screen.
  const [phase, setPhase] = React.useState<"form" | "building" | "reveal">("form");
  const [shop, setShop] = React.useState<{ orgSlug: string; catalogSlug: string } | null>(null);

  // Restore once, then persist on every change.
  React.useEffect(() => {
    try {
      const raw = sessionStorage.getItem(DRAFT_KEY);
      if (raw) {
        const d = JSON.parse(raw) as Partial<WizardDraft>;
        if (d?.v === 1) {
          if (typeof d.vertical === "string" && isShopVertical(d.vertical)) {
            setVertical(d.vertical);
          }
          if (typeof d.name === "string") setName(d.name);
          if (Array.isArray(d.sections)) setSections(d.sections);
          if (Array.isArray(d.modes)) setModes(d.modes);
          if (typeof d.browseOnly === "boolean") setBrowseOnly(d.browseOnly);
          if (d.currency && typeof d.currency === "object") {
            setCurrency(normalizeCurrencySettings(d.currency));
          }
          if (typeof d.country === "string") setCountry(d.country);
          if (typeof d.tableCount === "number") setTableCount(d.tableCount);
          if (Array.isArray(d.locales) && d.locales.length > 0) setLocales(d.locales);
          if (typeof d.phone === "string") setPhone(d.phone);
          if (typeof d.city === "string") setCity(d.city);
          if (typeof d.customCity === "boolean") setCustomCity(d.customCity);
          if (d.alertsIntent === "telegram" || d.alertsIntent === "dashboard") {
            setAlertsIntent(d.alertsIntent);
          }
          if (d.menuMethod === "manual" || d.menuMethod === "upload") {
            setMenuMethod(d.menuMethod);
          }
          if (Number.isInteger(d.cursor)) setCursor(Math.max(0, d.cursor as number));
        }
      }
    } catch {
      // Corrupt draft — start fresh.
    }
    setHydrated(true);
  }, []);

  React.useEffect(() => {
    // Stop persisting once the submit succeeds — the draft is cleared on
    // success and must not be resurrected by a late state change.
    if (!hydrated || phase !== "form") return;
    try {
      const draft: WizardDraft = {
        v: 1,
        cursor,
        vertical,
        name,
        sections,
        modes,
        browseOnly,
        currency,
        country,
        tableCount,
        locales,
        alertsIntent,
        menuMethod,
        phone,
        city,
        customCity,
      };
      sessionStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
    } catch {
      // Storage full/blocked — persistence is best-effort.
    }
  }, [hydrated, phase, cursor, vertical, name, sections, modes, browseOnly, currency, country, tableCount, locales, alertsIntent, menuMethod, phone, city, customCity]);

  const steps = buildSteps(sections, modes, menuMethod, browseOnly);
  const safeCursor = Math.min(Math.max(cursor, 0), steps.length - 1);
  const current = steps[safeCursor];
  const progressPct = Math.round(((safeCursor + 1) / steps.length) * 100);

  // Funnel: emit one "reached step X" event the first time each screen is
  // seen (per-kind dedupe — re-views from Back don't re-fire, and the N item
  // screens collapse to one "items" event). This is the per-screen data the
  // multi-screen design is meant to be tuned against.
  const seenSteps = React.useRef<Set<string>>(new Set());
  React.useEffect(() => {
    if (!hydrated || phase !== "form") return;
    if (seenSteps.current.has(current.kind)) return;
    seenSteps.current.add(current.kind);
    trackWizard("step", { step: current.kind });
  }, [hydrated, phase, current.kind]);

  const goNext = () => {
    setError(null);
    setCursor(Math.min(safeCursor + 1, steps.length - 1));
  };
  const goBack = () => {
    setError(null);
    setCursor(Math.max(safeCursor - 1, 0));
  };

  // Picking a country pre-sets the currency (code + formatting) so the next
  // step opens on the right money. The merchant can still override everything
  // on the currency screen — country just supplies the smart default.
  const chooseCountry = (code: string) => {
    setCountry(code);
    setCurrency(getCurrencyDefaults(getCurrencyForCountry(code)));
  };

  const pickVertical = async (key: ShopVertical) => {
    trackWizard("vertical", { vertical: key });
    // Re-tapping the same vertical keeps the merchant's edits; only a fresh
    // or changed pick refetches suggestions.
    if (vertical === key && sections.length > 0) {
      setCursor(1);
      return;
    }
    setBusy(true);
    setError(null);
    // Suggestions are a convenience, never a gate: any failure (cold server,
    // dropped connection) degrades to an empty draft the merchant can fill.
    let res: Awaited<ReturnType<typeof getVerticalSuggestions>>;
    try {
      res = await getVerticalSuggestions(key);
    } catch {
      res = { error: "Suggestions unavailable." };
    }
    setBusy(false);
    if ("error" in res) {
      setSections([]);
      setModes(VERTICALS[key].fallbackModes);
    } else {
      setSections(
        res.sections.map((s) => ({
          key: `sg-${s.slug}`,
          name: s.name,
          checked: true,
          suggestionSlug: s.slug,
          items: s.items.map((i) => ({
            key: `sg-${s.slug}-${i.slug}`,
            name: i.name,
            priceSum: String(Math.round(i.defaultPriceCents / 100)),
            checked: true,
            suggestionSlug: i.slug,
            suggested: { name: i.name, priceCents: i.defaultPriceCents },
          })),
        })),
      );
      setModes(
        (res.defaultModes as VenueMode[]).filter((m) =>
          VERTICALS[key].allowedModes.includes(m),
        ),
      );
    }
    setVertical(key);
    setCursor(1);
  };

  // ── menu-method handlers ────────────────────────────────────────────────
  const chooseMenuMethod = (method: MenuMethod) => {
    trackWizard("menu_method", { method });
    setMenuMethod(method);
    // goNext lands on menu_upload (upload) or sections (manual): the next
    // index resolves correctly once the step list recomputes — see buildSteps.
    goNext();
  };

  const addMenuFiles = (incoming: File[]) => {
    if (incoming.length === 0) return;
    setError(null);
    setMenuFiles((prev) => {
      const next = [...prev];
      for (const file of incoming) {
        if (next.length >= 20) {
          setError(copy.menuUpload.tooMany);
          break;
        }
        if (file.size > 12 * 1024 * 1024) {
          setError(copy.menuUpload.tooLarge);
          continue;
        }
        next.push(file);
      }
      return next;
    });
  };

  const removeMenuFile = (index: number) =>
    setMenuFiles((prev) => prev.filter((_, i) => i !== index));

  const runExtraction = async () => {
    if (menuFiles.length === 0) {
      setError(copy.menuUpload.empty);
      return;
    }
    setExtracting(true);
    setError(null);
    trackWizard("menu_extract", { files: menuFiles.length });
    // Downscale images client-side before upload: 20 raw phone photos would blow
    // the server-action body cap, and full resolution isn't needed to read a
    // menu. PDFs / undecodable files pass through. Then guard the compressed
    // total against the 32 MB cap (next.config) with a clear message instead of
    // the generic network-failure catch below.
    const compressed = await Promise.all(menuFiles.map(compressImageFile));
    const totalBytes = compressed.reduce((n, f) => n + f.size, 0);
    if (totalBytes > 30 * 1024 * 1024) {
      setExtracting(false);
      setError(copy.menuUpload.tooLargeTotal);
      return;
    }
    const fd = new FormData();
    for (const file of compressed) fd.append("files", file);
    let res: ExtractMenuResult;
    try {
      res = await extractMenuAction(fd);
    } catch {
      res = {
        ok: false,
        error: "Couldn't read the menu. Check your connection and try again.",
      };
    }
    setExtracting(false);
    if (!res.ok) {
      trackWizard("menu_extract_error");
      setError(res.error);
      return;
    }
    const extracted = sectionsFromExtraction(res.menu);
    setSections(extracted);
    trackWizard("menu_extracted", {
      sections: extracted.length,
      items: extracted.reduce((n, s) => n + s.items.length, 0),
    });
    // Forward to the sections/items review, pre-filled from the photo.
    goNext();
  };

  const submit = async (opts: { includeCity: boolean }) => {
    if (!vertical) return;
    setBusy(true);
    setSubmitVia(opts.includeCity ? "create" : "skip");
    setError(null);
    const payload: WizardPayload = {
      vertical,
      name: name.trim(),
      sections: sections
        .filter((s) => s.checked && s.name.trim())
        .map((s) => ({
          name: s.name.trim(),
          suggestionSlug: s.suggestionSlug,
          items: s.items
            .filter((i) => i.checked && i.name.trim())
            .map((i) => ({
              name: i.name.trim(),
              priceCents: parseSum(i.priceSum) * 100,
              description: i.description?.trim() || null,
              variations: i.variations ?? [],
              modifiers: i.modifiers ?? [],
              suggestionSlug: i.suggestionSlug,
              untouched: Boolean(
                i.suggested &&
                  i.name.trim() === i.suggested.name &&
                  parseSum(i.priceSum) * 100 === i.suggested.priceCents,
              ),
            })),
        })),
      // Browse-only catalogs take no orders, but the venue still needs a valid
      // mode — seed pickup so flipping the cart on later (Studio) just works.
      // The browseOnly flag is what disables the cart server-side.
      modes: browseOnly ? ["pickup"] : modes,
      browseOnly,
      currency,
      country,
      tableCount: !browseOnly && modes.includes("dine_in") ? tableCount : 0,
      locales,
      phone: phone.trim(),
      city: opts.includeCity ? city.trim() : "",
    };
    const itemCount = payload.sections.reduce((n, s) => n + s.items.length, 0);
    trackWizard("submit", {
      via: opts.includeCity ? "create" : "skip",
      alerts: alertsIntent,
      sections: payload.sections.length,
      items: itemCount,
    });
    // The theater plays while the RPC runs; both must finish before the
    // reveal so the staged labels get their beat even on a fast network.
    setPhase("building");
    const [res] = await Promise.all([
      createShopFromWizard(payload).catch(() => ({
        error: "We couldn't set up your shop. Check your connection and try again.",
      })),
      delay(BUILDING_MIN_MS),
    ]);
    setBusy(false);
    if ("error" in res) {
      trackWizard("submit_error");
      setPhase("form");
      setError(res.error);
      return;
    }
    trackWizard("created");
    // Optional logo: now that the catalog exists, upload the held file before
    // the reveal so the phone-frame preview shows it. Best-effort — on any
    // failure the shop keeps the placeholder logo set at creation, and the
    // merchant can re-upload from the Studio. The building theater stays up
    // while this runs (phase is still "building").
    if (logoFile) {
      try {
        const fd = new FormData();
        fd.append("catalogId", res.catalogId);
        fd.append("orgId", res.orgId);
        fd.append("logo", logoFile);
        await fetch("/api/catalogs/logo", { method: "POST", body: fd });
      } catch {
        // Keep the placeholder; not worth blocking the reveal.
      }
    }
    try {
      sessionStorage.removeItem(DRAFT_KEY);
    } catch {
      // Best-effort; a stale draft is inert once the session owns a shop.
    }
    setShop({ orgSlug: res.orgSlug, catalogSlug: res.catalogSlug });
    setPhase("reveal");
  };

  const header = (title: string, subtitle: string, showBack = true) => (
    <>
      <div
        role="progressbar"
        aria-label={copy.common.progressLabel}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={progressPct}
        className="h-1 w-full overflow-hidden rounded-full bg-muted"
      >
        <div
          className="h-full rounded-full bg-primary transition-[width] duration-200 ease-out"
          style={{ width: `${progressPct}%` }}
        />
      </div>
      {showBack ? (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="-ml-2 mb-4 mt-6 text-muted-foreground"
          onClick={goBack}
          disabled={busy}
        >
          <ArrowLeft className="size-4" />
          {copy.common.back}
        </Button>
      ) : null}
      <h1
        className={cn(
          "text-2xl font-semibold tracking-tight",
          !showBack && "mt-8",
        )}
      >
        {title}
      </h1>
      <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>
    </>
  );

  const continueButton = (onClick: () => void, label = copy.common.continue, disabled = false) => (
    <Button type="button" className="mt-6 w-full" onClick={onClick} disabled={busy || disabled}>
      {busy ? <Loader2 className="animate-spin" /> : null}
      {label}
    </Button>
  );

  // ── building / reveal phases override the step machine ───────────────────
  if (phase === "building") {
    const stages = copy.building.stages.filter(
      (_, i) =>
        i !== copy.building.tablesStageIndex ||
        (modes.includes("dine_in") && tableCount > 0),
    );
    return <BuildingScreen stages={stages} />;
  }

  if (phase === "reveal" && shop) {
    return (
      <section key="reveal">
        {/* Shop-created celebration — fires once on mount. */}
        <ConfettiSideCannons />
        <div
          role="progressbar"
          aria-label={copy.common.progressLabel}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={100}
          className="h-1 w-full overflow-hidden rounded-full bg-muted"
        >
          <div className="h-full w-full rounded-full bg-primary" />
        </div>
        <h1 className="mt-8 text-2xl font-semibold tracking-tight">
          {fmt(copy.reveal.title, { name: name.trim() })}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {copy.reveal.subtitle}
        </p>
        {/* The REAL storefront, rendered by the preview route from the shop
            we just created (owner-session draft fallback). Same-origin iframe
            carries the merchant's cookies, so /preview resolves the unpublished
            draft. This IS what customers will see — not a reconstruction. */}
        {/* Framed in an iPhone mockup. The storefront is rendered at a real
            phone width (390px) and scaled to fill the screen, and inset below
            the dynamic island so its header stays in the top safe area. */}
        <div className="mx-auto mt-6 w-full max-w-[300px]">
          <Iphone className="w-full">
            {/* Screen bg matches the storefront's own (white / dark) so the
                safe area has no seam in dark mode; the iOS status bar fills it. */}
            <div className="absolute inset-0 bg-white dark:bg-secondary-background">
              <IphoneStatusBar />
              <iframe
                title="Your storefront preview"
                src={`/preview/${shop.catalogSlug}`}
                className="absolute left-0 origin-top-left border-0"
                style={{
                  top: "38px",
                  width: "390px",
                  height: "780px",
                  transform: "scale(0.692)",
                }}
              />
            </div>
          </Iphone>
        </div>
        {alertsIntent === "telegram" ? (
          <Button asChild className="mt-6 w-full">
            <Link
              href={`/dashboard/${shop.orgSlug}/${shop.catalogSlug}/settings`}
              onClick={() => trackWizard("reveal_cta", { target: "alerts" })}
            >
              {copy.reveal.alertsCta}
            </Link>
          </Button>
        ) : null}
        <Button
          asChild
          variant={alertsIntent === "telegram" ? "ghost" : "default"}
          className={cn("w-full", alertsIntent === "telegram" ? "mt-2" : "mt-6")}
        >
          <Link
            href={`/dashboard/${shop.orgSlug}/${shop.catalogSlug}/items`}
            onClick={() => trackWizard("reveal_cta", { target: "dashboard" })}
          >
            {copy.reveal.cta}
          </Link>
        </Button>
      </section>
    );
  }

  // ── ① type ────────────────────────────────────────────────────────────────
  if (current.kind === "type") {
    return (
      <section key="type" aria-labelledby="onboarding-heading">
        {header(copy.type.title, copy.type.subtitle, false)}
        <div className="mt-6 flex flex-col gap-2">
          {VERTICAL_KEYS.map((key) => {
            const { icon: Icon } = VERTICALS[key];
            const { label, description } = verticalCopy[key];
            return (
              <button
                key={key}
                type="button"
                disabled={busy}
                onClick={() => void pickVertical(key)}
                className="flex min-h-14 w-full items-center gap-3 rounded-lg border bg-card px-4 py-3 text-left transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
              >
                <Icon className="size-5 shrink-0 text-muted-foreground" />
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="text-sm font-medium">{label}</span>
                  <span className="truncate text-xs text-muted-foreground">{description}</span>
                </span>
                {busy && vertical === key ? (
                  <Loader2 className="size-4 shrink-0 animate-spin text-muted-foreground" />
                ) : (
                  <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
                )}
              </button>
            );
          })}
        </div>
        {/* Sign-out escape hatch — mirrors the one on the 404 page. A visitor
            who arrived here on a carried-over anonymous session (e.g. from the
            storefront) can drop it and sign in as themselves before setting up
            a shop. Only shown on the first step. */}
        <div className="mt-8 flex justify-center">
          <SignOutButton
            variant="ghost"
            size="sm"
            className="text-muted-foreground"
          >
            {copy.common.logout}
          </SignOutButton>
        </div>
      </section>
    );
  }

  // ── ② name ────────────────────────────────────────────────────────────────
  if (current.kind === "name") {
    return (
      <section key="name">
        {header(copy.name.title, copy.name.subtitle)}
        <form
          className="mt-6 flex flex-col gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (name.trim()) goNext();
          }}
        >
          <Label htmlFor="wizard-name">{copy.name.label}</Label>
          <Input
            id="wizard-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={copy.name.placeholder}
            maxLength={80}
            required
            autoFocus
            autoComplete="organization"
          />
          {continueButton(() => name.trim() && goNext())}
        </form>
      </section>
    );
  }

  // ── logo (optional) ───────────────────────────────────────────────────────
  if (current.kind === "logo") {
    return (
      <section key="logo">
        {header(copy.logo.title, copy.logo.subtitle)}
        <input
          ref={logoInputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/svg+xml"
          className="sr-only"
          onChange={(e) => {
            const file = e.target.files?.[0] ?? null;
            // Keep logos reasonable — a few hundred KB is plenty for a mark.
            if (file && file.size > 5 * 1024 * 1024) {
              setError(copy.logo.tooLarge);
              e.target.value = "";
              return;
            }
            setError(null);
            pickLogo(file);
            // Allow re-picking the same file after a Remove.
            e.target.value = "";
          }}
        />
        <div className="mt-6">
          {logoPreview ? (
            <div className="flex items-center gap-4 rounded-lg border bg-card p-3">
              <div className="relative size-16 shrink-0 overflow-hidden rounded-md bg-muted">
                {/* Local object-URL preview — a transient blob: URL that
                    next/image can't optimize, so a plain <img> is correct. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={logoPreview}
                  alt={copy.logo.previewAria}
                  className="size-full object-cover"
                />
              </div>
              <div className="flex flex-1 items-center gap-1">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => logoInputRef.current?.click()}
                >
                  {copy.logo.replace}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="text-muted-foreground"
                  onClick={() => pickLogo(null)}
                >
                  {copy.logo.remove}
                </Button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => logoInputRef.current?.click()}
              className="flex min-h-28 w-full flex-col items-center justify-center gap-1.5 rounded-lg border border-dashed bg-card px-4 py-6 text-center text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <ImagePlus className="size-6" />
              <span className="text-sm font-medium">{copy.logo.pick}</span>
              <span className="text-xs">{copy.logo.hint}</span>
            </button>
          )}
        </div>
        {error ? (
          <p role="alert" className="mt-2 text-sm text-destructive">
            {error}
          </p>
        ) : null}
        {continueButton(goNext)}
      </section>
    );
  }

  // ── menu method — build by hand or upload an existing menu ───────────────
  if (current.kind === "menu_method") {
    const options: MenuMethod[] = ["upload", "manual"];
    return (
      <section key="menu_method">
        {header(copy.menuMethod.title, copy.menuMethod.subtitle)}
        <div className="mt-6 flex flex-col gap-2">
          {options.map((opt) => {
            const meta = copy.menuMethod.options[opt];
            const Icon = opt === "upload" ? Sparkles : PencilLine;
            return (
              <button
                key={opt}
                type="button"
                disabled={busy}
                onClick={() => chooseMenuMethod(opt)}
                className="flex min-h-14 w-full items-center gap-3 rounded-lg border bg-card px-4 py-3 text-left transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
              >
                <Icon className="size-5 shrink-0 text-muted-foreground" />
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="text-sm font-medium">{meta.label}</span>
                  <span className="truncate text-xs text-muted-foreground">
                    {meta.hint}
                  </span>
                </span>
                <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
              </button>
            );
          })}
        </div>
      </section>
    );
  }

  // ── menu upload — files → AI extraction → sections/items ──────────────────
  if (current.kind === "menu_upload") {
    if (extracting) {
      return (
        <section key="menu_upload" role="status" aria-live="polite">
          {header(copy.menuUpload.title, copy.menuUpload.subtitle)}
          <div className="mt-12 flex flex-col items-center justify-center gap-3 text-center">
            <Loader2 className="size-8 animate-spin text-primary" />
            <p className="text-sm font-medium">
              {copy.menuUpload.extracting}
            </p>
            <p className="text-xs text-muted-foreground">
              {copy.menuUpload.extractingHint}
            </p>
          </div>
        </section>
      );
    }
    const fileCount = menuFiles.length;
    return (
      <section key="menu_upload">
        {header(copy.menuUpload.title, copy.menuUpload.subtitle)}
        <input
          ref={menuInputRef}
          type="file"
          // image/* is the most reliable on iOS (offers Photo Library + Camera
          // and auto-transcodes HEIC → JPEG); PDFs come via Files.
          accept="image/*,application/pdf"
          multiple
          className="sr-only"
          onChange={(e) => {
            // Snapshot to a stable array BEFORE resetting the input. iOS Safari
            // empties the live FileList when value is cleared, which would leave
            // nothing for React's deferred setMenuFiles to read (no chip added,
            // hence "the photo won't upload"). Desktop Chrome happens to survive
            // it; iOS doesn't.
            const picked = e.target.files ? Array.from(e.target.files) : [];
            e.target.value = "";
            addMenuFiles(picked);
          }}
        />
        <div className="mt-6 flex flex-col gap-2">
          {menuFiles.map((file, i) => (
            <div
              key={`${file.name}-${i}`}
              className="flex min-h-12 items-center gap-3 rounded-lg border bg-card px-3 py-2"
            >
              <FileText className="size-5 shrink-0 text-muted-foreground" />
              <span className="min-w-0 flex-1 truncate text-sm">{file.name}</span>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="size-8 shrink-0 text-muted-foreground"
                onClick={() => removeMenuFile(i)}
                aria-label={fmt(copy.menuUpload.removeAria, {
                  name: file.name,
                })}
              >
                <X className="size-4" />
              </Button>
            </div>
          ))}
          {fileCount === 0 ? (
            <button
              type="button"
              onClick={() => menuInputRef.current?.click()}
              className="flex min-h-28 w-full flex-col items-center justify-center gap-1.5 rounded-lg border border-dashed bg-card px-4 py-6 text-center text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <Upload className="size-6" />
              <span className="text-sm font-medium">{copy.menuUpload.pick}</span>
              <span className="text-xs">{copy.menuUpload.hint}</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={() => menuInputRef.current?.click()}
              className="flex min-h-12 w-full items-center gap-2 rounded-lg border border-dashed px-3 py-2 text-left text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <Plus className="size-4 shrink-0" />
              {copy.menuUpload.addMore}
            </button>
          )}
        </div>
        {error ? (
          <p role="alert" className="mt-2 text-sm text-destructive">
            {error}
          </p>
        ) : null}
        <Button
          type="button"
          className="mt-6 w-full"
          onClick={() => void runExtraction()}
          disabled={busy || fileCount === 0}
        >
          <Sparkles className="size-4" />
          {copy.menuUpload.extract}
        </Button>
        <Button
          type="button"
          variant="ghost"
          className="mt-2 w-full text-muted-foreground"
          disabled={busy}
          onClick={() => {
            // Removing this step shifts the cursor onto sections — no goNext.
            setMenuFiles([]);
            setError(null);
            setMenuMethod("manual");
          }}
        >
          {copy.menuUpload.manualFallback}
        </Button>
      </section>
    );
  }

  // ── ③ sections ────────────────────────────────────────────────────────────
  if (current.kind === "sections") {
    const toggle = (key: string) =>
      setSections((prev) => prev.map((s) => (s.key === key ? { ...s, checked: !s.checked } : s)));
    const addSection = (sectionName: string) => {
      const trimmed = sectionName.trim();
      if (!trimmed) return;
      setSections((prev) => [
        ...prev,
        { key: `c-${Date.now()}`, name: trimmed, checked: true, suggestionSlug: null, items: [] },
      ]);
    };
    return (
      <section key="sections">
        {header(
          copy.sections.title,
          vertical
            ? fmt(copy.sections.subtitleVertical, {
                vertical: verticalCopy[vertical].label.toLowerCase(),
              })
            : copy.sections.subtitleBare,
        )}
        <div className="mt-6 flex flex-col gap-2">
          {sections.map((s) => (
            <label
              key={s.key}
              className={cn(
                "flex min-h-12 cursor-pointer items-center gap-3 rounded-lg border bg-card px-4 py-2.5 transition-colors hover:bg-accent",
                !s.checked && "opacity-60",
              )}
            >
              <Checkbox checked={s.checked} onCheckedChange={() => toggle(s.key)} />
              <span className="min-w-0 flex-1 truncate text-sm font-medium">{s.name}</span>
              {s.items.length > 0 ? (
                <span className="text-xs text-muted-foreground">
                  {fmt(copy.sections.suggestedCount, { n: s.items.length })}
                </span>
              ) : null}
            </label>
          ))}
          <AddRow placeholder={copy.sections.addPlaceholder} onAdd={addSection} />
        </div>
        {continueButton(goNext)}
      </section>
    );
  }

  // ── items — one screen, all checked sections stacked ─────────────────────
  if (current.kind === "items") {
    const checkedSections = sections.filter((s) => s.checked && s.name.trim());
    const patchItem = (sKey: string, iKey: string, patch: Partial<ItemDraft>) =>
      setSections((prev) =>
        prev.map((s) =>
          s.key === sKey
            ? { ...s, items: s.items.map((i) => (i.key === iKey ? { ...i, ...patch } : i)) }
            : s,
        ),
      );
    const addItem = (sKey: string, itemName: string, priceSum: string) =>
      setSections((prev) =>
        prev.map((s) =>
          s.key === sKey
            ? {
                ...s,
                items: [
                  ...s.items,
                  {
                    key: `i-${Date.now()}`,
                    name: itemName.trim(),
                    priceSum: String(parseSum(priceSum)),
                    checked: true,
                    suggestionSlug: null,
                    suggested: null,
                  },
                ],
              }
            : s,
        ),
      );
    return (
      <section key="items">
        {header(copy.items.title, copy.items.subtitle)}
        <div className="mt-6 flex flex-col gap-6">
          {checkedSections.map((section) => (
            <div key={section.key}>
              <h2 className="mb-2 text-sm font-medium text-muted-foreground">
                {section.name}
              </h2>
              <div className="flex flex-col gap-2">
                {section.items.map((i) => (
                  <div
                    key={i.key}
                    className={cn(
                      "rounded-lg border bg-card",
                      !i.checked && "opacity-50",
                    )}
                  >
                    <div className="flex min-h-12 items-center gap-2 px-3 py-2">
                      <Checkbox
                        checked={i.checked}
                        onCheckedChange={() =>
                          patchItem(section.key, i.key, { checked: !i.checked })
                        }
                        aria-label={fmt(copy.items.includeAria, {
                          name: i.name,
                        })}
                      />
                      <Input
                        value={i.name}
                        onChange={(e) =>
                          patchItem(section.key, i.key, { name: e.target.value })
                        }
                        maxLength={80}
                        aria-label={copy.items.nameAria}
                        className="h-8 min-w-0 flex-1 border-transparent px-2 shadow-none focus-visible:border-input"
                      />
                      <div className="flex shrink-0 items-center gap-1">
                        <Input
                          value={formatSum(i.priceSum)}
                          onChange={(e) =>
                            patchItem(section.key, i.key, {
                              priceSum: e.target.value.replace(/[^\d]/g, ""),
                            })
                          }
                          inputMode="numeric"
                          aria-label={copy.items.priceAria}
                          className="h-8 w-24 border-transparent px-2 text-right font-mono tabular-nums shadow-none focus-visible:border-input"
                        />
                        <span className="text-xs text-muted-foreground">
                          {currency.label}
                        </span>
                      </div>
                    </div>
                    {i.description ? (
                      <p className="px-3 pb-2 pl-9 text-xs leading-snug text-muted-foreground">
                        {i.description}
                      </p>
                    ) : null}
                    {i.variations?.length || i.modifiers?.length ? (
                      <p className="px-3 pb-2 pl-9 text-[11px] leading-snug text-muted-foreground/80">
                        {[
                          i.variations?.length
                            ? `${copy.items.sizesLabel}: ${i.variations
                                .map((v) => v.name)
                                .join(", ")}`
                            : null,
                          i.modifiers?.length
                            ? `${copy.items.addOnsLabel}: ${i.modifiers
                                .map((m) => m.name)
                                .join(", ")}`
                            : null,
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </p>
                    ) : null}
                  </div>
                ))}
                <AddRow
                  placeholder={copy.items.addPlaceholder}
                  withPrice
                  currencySuffix={currency.label}
                  onAddWithPrice={(n, p) => addItem(section.key, n, p)}
                />
              </div>
            </div>
          ))}
        </div>
        {continueButton(goNext)}
      </section>
    );
  }

  // ── country ────────────────────────────────────────────────────────────────
  if (current.kind === "country") {
    return (
      <section key="country">
        {header(copy.country.title, copy.country.subtitle)}
        <div className="mt-6 flex flex-col gap-3">
          <CountryPicker value={country} onChange={chooseCountry} />
          <p className="text-sm text-muted-foreground">
            {fmt(copy.country.currencyHint, {
              currency: getCurrencyForCountry(country),
            })}
          </p>
        </div>
        {continueButton(goNext)}
      </section>
    );
  }

  // ── currency ──────────────────────────────────────────────────────────────
  if (current.kind === "currency") {
    const setField = (patch: Partial<CurrencySettings>) =>
      setCurrency((prev) => ({ ...prev, ...patch }));
    return (
      <section key="currency">
        {header(copy.currency.title, copy.currency.subtitle)}
        <div className="mt-6 flex flex-col gap-3">
          <CurrencyPicker
            value={currency.defaultCurrency}
            onChange={(code) => setCurrency(getCurrencyDefaults(code))}
          />
          <div className="rounded-lg border bg-card px-4 py-4 text-center">
            <div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
              {copy.currency.sampleLabel}
            </div>
            <div className="mt-2 font-mono text-2xl font-semibold tracking-tight">
              {formatPriceCents(123456700, currency)}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <div className="mb-1.5 text-xs text-muted-foreground">
                {copy.currency.symbol}
              </div>
              <Input
                value={currency.label}
                onChange={(e) => setField({ label: e.target.value.slice(0, 12) })}
                aria-label={copy.currency.symbol}
                className="h-9"
              />
            </div>
            <CurrencyToggle
              label={copy.currency.position}
              value={currency.labelPosition}
              options={[
                { v: "prefix", l: copy.currency.before },
                { v: "suffix", l: copy.currency.after },
              ]}
              onChange={(v) => setField({ labelPosition: v as CurrencyLabelPosition })}
            />
            <CurrencyToggle
              label={copy.currency.decimals}
              value={currency.showDecimals ? "on" : "off"}
              options={[
                { v: "on", l: copy.currency.on },
                { v: "off", l: copy.currency.off },
              ]}
              onChange={(v) => setField({ showDecimals: v === "on" })}
            />
            <CurrencyToggle
              label={copy.currency.thousands}
              value={currency.thousandSeparator}
              options={[
                { v: " ", l: copy.currency.space },
                { v: ",", l: "," },
                { v: ".", l: "." },
              ]}
              onChange={(v) => setField({ thousandSeparator: v as ThousandSeparator })}
            />
          </div>
        </div>
        {continueButton(goNext)}
      </section>
    );
  }

  // ── modes ─────────────────────────────────────────────────────────────────
  if (current.kind === "modes") {
    // Picking an order mode exits browse-only; choosing browse-only clears the
    // order modes. The two are mutually exclusive: a shop either takes orders
    // (≥1 mode) or is a browse-only catalog (cart disabled).
    const toggleMode = (m: VenueMode) => {
      setBrowseOnly(false);
      setModes((prev) => (prev.includes(m) ? prev.filter((x) => x !== m) : [...prev, m]));
    };
    const chooseBrowseOnly = () => {
      setBrowseOnly(true);
      setModes([]);
    };
    const availableModes = vertical
      ? VERTICALS[vertical].allowedModes
      : (Object.keys(copy.modes.labels) as VenueMode[]);
    const canContinue = browseOnly || modes.length > 0;
    return (
      <section key="modes">
        {header(copy.modes.title, copy.modes.subtitle)}
        <div className="mt-6 flex flex-col gap-2">
          {availableModes.map((m) => {
            const checked = !browseOnly && modes.includes(m);
            return (
            <label
              key={m}
              className={cn(
                "flex min-h-12 cursor-pointer items-center gap-3 rounded-lg border bg-card px-4 py-2.5 transition-colors hover:bg-accent",
                // Checked order modes get a subtle highlight so the active
                // choice reads at a glance. NOT dimmed when browse-only is on —
                // they stay live so tapping one switches back to taking orders.
                checked && "border-foreground/40 bg-accent",
              )}
            >
              <Checkbox
                checked={checked}
                onCheckedChange={() => toggleMode(m)}
              />
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="text-sm font-medium">{copy.modes.labels[m].label}</span>
                <span className="truncate text-xs text-muted-foreground">
                  {copy.modes.labels[m].hint}
                </span>
              </span>
            </label>
            );
          })}
        </div>

        <div className="my-4 flex items-center gap-3">
          <span className="h-px flex-1 bg-border" />
          <span className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
            {copy.modes.or}
          </span>
          <span className="h-px flex-1 bg-border" />
        </div>

        <button
          type="button"
          onClick={chooseBrowseOnly}
          className={cn(
            "flex min-h-12 w-full items-center gap-3 rounded-lg border bg-card px-4 py-2.5 text-left transition-colors hover:bg-accent",
            browseOnly && "border-foreground/40 bg-accent",
          )}
        >
          <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
            <BookOpen className="size-4" />
          </span>
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="text-sm font-medium">{copy.modes.browseOnly.label}</span>
            <span className="truncate text-xs text-muted-foreground">
              {copy.modes.browseOnly.hint}
            </span>
          </span>
          <span
            className={cn(
              "flex size-[18px] shrink-0 items-center justify-center rounded-full border",
              browseOnly ? "border-primary" : "border-muted-foreground/40",
            )}
          >
            {browseOnly ? <span className="size-2.5 rounded-full bg-primary" /> : null}
          </span>
        </button>

        {continueButton(goNext, copy.common.continue, !canContinue)}
        {!canContinue ? (
          <p className="mt-2 text-center text-xs text-destructive">
            {copy.modes.atLeastOne}
          </p>
        ) : null}
      </section>
    );
  }

  // ── tables (dine-in only) ─────────────────────────────────────────────────
  if (current.kind === "tables") {
    return (
      <section key="tables">
        {header(copy.tables.title, copy.tables.subtitle)}
        <div className="mt-6 flex items-center justify-between gap-3 rounded-lg border bg-card px-4 py-3">
          <div className="min-w-0">
            <p className="text-sm font-medium">{copy.tables.cardTitle}</p>
            <p className="text-xs text-muted-foreground">{copy.tables.cardHint}</p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="size-9"
              onClick={() => setTableCount((n) => Math.max(0, n - 1))}
              aria-label={copy.tables.fewerAria}
            >
              <Minus className="size-4" />
            </Button>
            <span className="w-8 text-center font-mono text-sm tabular-nums">{tableCount}</span>
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="size-9"
              onClick={() => setTableCount((n) => Math.min(50, n + 1))}
              aria-label={copy.tables.moreAria}
            >
              <Plus className="size-4" />
            </Button>
          </div>
        </div>
        {continueButton(goNext)}
      </section>
    );
  }

  // ── languages ─────────────────────────────────────────────────────────────
  if (current.kind === "languages") {
    const makeDefault = (code: string) =>
      setLocales((prev) => prev.map((l) => ({ ...l, isDefault: l.code === code })));
    const removeLocale = (code: string) =>
      setLocales((prev) =>
        prev.length > 1 ? prev.filter((l) => l.code !== code) : prev,
      );
    const addLocale = (code: string) =>
      setLocales((prev) =>
        prev.some((l) => l.code === code) ? prev : [...prev, { code, isDefault: false }],
      );
    return (
      <section key="languages">
        {header(copy.languages.title, copy.languages.subtitle)}
        <div className="mt-6 flex flex-col gap-2">
          {locales.map((l) => {
            const def = getLocaleDefinition(l.code);
            return (
              <div
                key={l.code}
                className="flex min-h-12 items-center gap-2 rounded-lg border bg-card py-2.5 pl-4 pr-2"
              >
                <span className="flex min-w-0 flex-1 items-baseline gap-2">
                  <span className="truncate text-sm font-medium">
                    {def?.nativeName ?? l.code}
                  </span>
                  <span className="hidden shrink-0 text-xs text-muted-foreground sm:inline">
                    {def?.englishName}
                  </span>
                </span>
                {l.isDefault ? (
                  <Badge variant="outline" className="mr-2 shrink-0">
                    <Check className="size-3" />
                    {copy.languages.defaultBadge}
                  </Badge>
                ) : (
                  <>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="shrink-0 text-muted-foreground"
                      onClick={() => makeDefault(l.code)}
                    >
                      {copy.languages.makeDefault}
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="size-8 shrink-0 text-muted-foreground"
                      onClick={() => removeLocale(l.code)}
                      aria-label={fmt(copy.languages.removeAria, {
                        name: def?.englishName ?? l.code,
                      })}
                    >
                      <X className="size-4" />
                    </Button>
                  </>
                )}
              </div>
            );
          })}
          <LocalePicker
            value={null}
            onChange={addLocale}
            excludeCodes={locales.map((l) => l.code)}
          />
        </div>
        {continueButton(goNext)}
      </section>
    );
  }

  // ── alerts — order-notification intent (one tap, telegram pre-selected) ──
  if (current.kind === "alerts") {
    const options: AlertsIntent[] = ["telegram", "dashboard"];
    return (
      <section key="alerts">
        {header(copy.alerts.title, copy.alerts.subtitle)}
        <div className="mt-6 flex flex-col gap-2">
          {options.map((opt) => {
            const meta = copy.alerts.options[opt];
            const selected = alertsIntent === opt;
            return (
              <button
                key={opt}
                type="button"
                onClick={() => setAlertsIntent(opt)}
                aria-pressed={selected}
                className={cn(
                  "flex min-h-12 items-center gap-3 rounded-lg border bg-card px-4 py-2.5 text-left transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  selected && "border-primary ring-1 ring-primary",
                )}
              >
                <span
                  className={cn(
                    "flex size-5 shrink-0 items-center justify-center rounded-full border",
                    selected
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-input",
                  )}
                >
                  {selected ? <Check className="size-3.5" /> : null}
                </span>
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="text-sm font-medium">{meta.label}</span>
                  <span className="truncate text-xs text-muted-foreground">
                    {meta.hint}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
        {continueButton(goNext)}
      </section>
    );
  }

  // ── phone ─────────────────────────────────────────────────────────────────
  if (current.kind === "phone") {
    return (
      <section key="phone">
        {header(copy.phone.title, copy.phone.subtitle)}
        <form
          className="mt-6 flex flex-col gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            goNext();
          }}
        >
          <Label htmlFor="wizard-phone">{copy.phone.label}</Label>
          <Input
            id="wizard-phone"
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder={copy.phone.placeholder}
            maxLength={32}
            autoComplete="tel"
            autoFocus
          />
          {continueButton(goNext)}
          <Button
            type="button"
            variant="ghost"
            className="w-full"
            disabled={busy}
            onClick={() => {
              setPhone("");
              goNext();
            }}
          >
            {copy.phone.skip}
          </Button>
        </form>
      </section>
    );
  }

  // ── city (final screen — submit) ──────────────────────────────────────────
  const pickCity = (value: string) => {
    setCustomCity(false);
    setCity((prev) => (prev === value ? "" : value));
  };
  return (
    <section key="city">
      {header(copy.city.title, copy.city.subtitle)}
      <form
        className="mt-6 flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          void submit({ includeCity: true });
        }}
      >
        <div className="flex flex-wrap gap-2">
          {CITY_CHIPS.map((c) => (
            <Button
              key={c}
              type="button"
              variant={!customCity && city === c ? "default" : "outline"}
              className="h-11 rounded-full px-4"
              disabled={busy}
              onClick={() => pickCity(c)}
            >
              {c}
            </Button>
          ))}
          <Button
            type="button"
            variant={customCity ? "default" : "outline"}
            className="h-11 rounded-full px-4"
            disabled={busy}
            onClick={() => {
              setCustomCity((prev) => {
                const next = !prev;
                if (next || city) setCity("");
                return next;
              });
            }}
          >
            {copy.city.otherChip}
          </Button>
        </div>
        {customCity ? (
          <div className="flex flex-col gap-2">
            <Label htmlFor="wizard-city">{copy.city.customLabel}</Label>
            <Input
              id="wizard-city"
              value={city}
              onChange={(e) => setCity(e.target.value)}
              placeholder={copy.city.customPlaceholder}
              maxLength={64}
              autoComplete="address-level2"
              autoFocus
              disabled={busy}
            />
          </div>
        ) : null}
        {error ? (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        ) : null}
        <Button type="submit" className="w-full" disabled={busy}>
          {busy && submitVia === "create" ? (
            <>
              <Loader2 className="animate-spin" />
              {copy.city.creating}
            </>
          ) : (
            copy.city.create
          )}
        </Button>
        <Button
          type="button"
          variant="ghost"
          className="w-full"
          disabled={busy}
          onClick={() => void submit({ includeCity: false })}
        >
          {busy && submitVia === "skip" ? (
            <>
              <Loader2 className="animate-spin" />
              {copy.city.creating}
            </>
          ) : (
            copy.city.skip
          )}
        </Button>
      </form>
    </section>
  );
}

// ── building theater ─────────────────────────────────────────────────────────

function BuildingScreen({ stages }: { stages: readonly string[] }) {
  // Honest theater: every label names a write the submit really performs.
  // The timer paces the labels; the reveal is gated on BOTH the timer's
  // minimum and the actual RPC completing (see submit()).
  const copy = getWizardCopy(useDashboardLocale());
  const [stageIdx, setStageIdx] = React.useState(0);
  React.useEffect(() => {
    const t = setInterval(
      () => setStageIdx((i) => Math.min(i + 1, stages.length - 1)),
      750,
    );
    return () => clearInterval(t);
  }, [stages.length]);

  return (
    <section key="building" role="status" aria-live="polite">
      <div className="h-1 w-full overflow-hidden rounded-full bg-muted">
        <div className="h-full w-full animate-pulse rounded-full bg-primary" />
      </div>
      <h1 className="mt-8 text-2xl font-semibold tracking-tight">
        {copy.building.title}
      </h1>
      <p className="mt-1 text-sm text-muted-foreground">
        {copy.building.subtitle}
      </p>
      <ul className="mt-6 flex flex-col gap-3">
        {stages.map((stage, i) => (
          <li
            key={stage}
            className={cn(
              "flex items-center gap-2.5 text-sm transition-opacity duration-200",
              i < stageIdx && "text-muted-foreground",
              i > stageIdx && "opacity-40",
            )}
          >
            {i < stageIdx ? (
              <Check className="size-4 shrink-0" />
            ) : i === stageIdx ? (
              <Loader2 className="size-4 shrink-0 animate-spin" />
            ) : (
              <span className="size-4 shrink-0" />
            )}
            {stage}
          </li>
        ))}
      </ul>
    </section>
  );
}

// ── shared add-row ───────────────────────────────────────────────────────────

// Compact segmented control for the currency styler (position / decimals /
// thousands). Onboarding's lighter-weight twin of the Studio's SegmentedField.
function CurrencyToggle({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: { v: string; l: string }[];
  onChange: (v: string) => void;
}) {
  return (
    <div>
      <div className="mb-1.5 text-xs text-muted-foreground">{label}</div>
      <div className="flex overflow-hidden rounded-md border">
        {options.map((o) => (
          <button
            key={o.v}
            type="button"
            onClick={() => onChange(o.v)}
            className={cn(
              "flex-1 py-2 text-xs transition-colors",
              value === o.v
                ? "bg-foreground text-background"
                : "text-muted-foreground hover:bg-accent",
            )}
          >
            {o.l}
          </button>
        ))}
      </div>
    </div>
  );
}

function AddRow({
  placeholder,
  withPrice = false,
  currencySuffix,
  onAdd,
  onAddWithPrice,
}: {
  placeholder: string;
  withPrice?: boolean;
  currencySuffix?: string;
  onAdd?: (name: string) => void;
  onAddWithPrice?: (name: string, priceSum: string) => void;
}) {
  const copy = getWizardCopy(useDashboardLocale());
  // Fallback to the locale's default suffix when the caller omits one (the
  // default was previously baked into the param — moved here so it localizes).
  const suffix = currencySuffix ?? copy.items.currencySuffix;
  // Progressive disclosure: idle = an explicit "+ Add" button; tapping it
  // reveals a real, visibly-bordered input. An always-on borderless input
  // read as decorative text, not as a field.
  const [editing, setEditing] = React.useState(false);
  const [value, setValue] = React.useState("");
  const [price, setPrice] = React.useState("");
  const reset = () => {
    setEditing(false);
    setValue("");
    setPrice("");
  };
  const commit = () => {
    if (!value.trim()) return;
    if (withPrice) onAddWithPrice?.(value, price);
    else onAdd?.(value);
    // Stay open for rapid multi-add; the input keeps focus.
    setValue("");
    setPrice("");
  };
  const keyHandler = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      commit();
    }
    if (e.key === "Escape") reset();
  };

  if (!editing) {
    return (
      <button
        type="button"
        onClick={() => setEditing(true)}
        className="flex min-h-12 w-full items-center gap-2 rounded-lg border border-dashed px-3 py-2 text-left text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <Plus className="size-4 shrink-0" />
        {placeholder}
      </button>
    );
  }

  return (
    <div className="flex min-h-12 items-center gap-2 rounded-lg border border-dashed px-3 py-2">
      <Input
        autoFocus
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={keyHandler}
        placeholder={placeholder}
        maxLength={80}
        className="h-8 min-w-0 flex-1"
      />
      {withPrice ? (
        <div className="flex shrink-0 items-center gap-1">
          <Input
            value={price.replace(/\B(?=(\d{3})+(?!\d))/g, " ")}
            onChange={(e) => setPrice(e.target.value.replace(/[^\d]/g, ""))}
            onKeyDown={keyHandler}
            inputMode="numeric"
            placeholder="0"
            aria-label={copy.items.priceAria}
            className="h-8 w-24 text-right font-mono tabular-nums"
          />
          <span className="text-xs text-muted-foreground">{suffix}</span>
        </div>
      ) : null}
      <Button
        type="button"
        size="sm"
        className="shrink-0"
        onClick={commit}
        disabled={!value.trim()}
      >
        {copy.common.add}
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="size-8 shrink-0 text-muted-foreground"
        onClick={reset}
        aria-label={copy.common.cancelAdd}
      >
        <X className="size-4" />
      </Button>
    </div>
  );
}
