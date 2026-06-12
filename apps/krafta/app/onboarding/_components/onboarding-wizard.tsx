"use client";

// KRA-42 wizard v3 / ADR 0005 §2 (amended) — guided seeding, one decision
// per screen.
//
//   ① type → ② name → ③ sections → ④…N items (one screen per checked
//   section) → modes → tables (dine-in only) → languages → phone → city
//   → single submit (complete_wizard RPC) → Studio.
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
  Check,
  ChevronRight,
  Loader2,
  Minus,
  Plus,
  X,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LocalePicker } from "@/components/locales/locale-picker";
import { getLocaleDefinition } from "@/lib/locales/registry";
import { cn } from "@/lib/utils";

import {
  createShopFromWizard,
  getVerticalSuggestions,
  type WizardPayload,
} from "./actions";
import { CITY_CHIPS, fmt, wizardCopy } from "./copy";
import { LOOK_KEYS, isLookKey, type LookKey } from "./presets";
import {
  VERTICALS,
  VERTICAL_KEYS,
  isShopVertical,
  type ShopVertical,
  type VenueMode,
} from "./verticals";
import {
  WizardLookPreview,
  type PreviewSection,
} from "./wizard-look-preview";

type ItemDraft = {
  key: string;
  name: string;
  /** Display value in sums (price_cents / 100), kept as string while editing. */
  priceSum: string;
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

type Step =
  | { kind: "type" }
  | { kind: "name" }
  | { kind: "sections" }
  | { kind: "items"; sectionKey: string }
  | { kind: "look" }
  | { kind: "modes" }
  | { kind: "tables" }
  | { kind: "languages" }
  | { kind: "phone" }
  | { kind: "city" };

function buildSteps(sections: SectionDraft[], modes: VenueMode[]): Step[] {
  return [
    { kind: "type" },
    { kind: "name" },
    { kind: "sections" },
    ...sections
      .filter((s) => s.checked)
      .map((s): Step => ({ kind: "items", sectionKey: s.key })),
    { kind: "look" },
    { kind: "modes" },
    ...(modes.includes("dine_in") ? [{ kind: "tables" } as Step] : []),
    { kind: "languages" },
    { kind: "phone" },
    { kind: "city" },
  ];
}

function parseSum(value: string): number {
  const n = Number(value.replace(/[^\d]/g, ""));
  return Number.isFinite(n) ? Math.min(n, 10_000_000) : 0;
}

/** UZS always renders with space thousands separators (DESIGN.md i18n). */
function formatSum(digits: string): string {
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, " ");
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
  /** Look preset key; absent in pre-PR2 drafts → defaults to "classic". */
  look?: LookKey;
  modes: VenueMode[];
  tableCount: number;
  locales: { code: string; isDefault: boolean }[];
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
  const [hydrated, setHydrated] = React.useState(false);
  const [cursor, setCursor] = React.useState(0);
  const [vertical, setVertical] = React.useState<ShopVertical | null>(null);
  const [name, setName] = React.useState("");
  const [sections, setSections] = React.useState<SectionDraft[]>([]);
  const [modes, setModes] = React.useState<VenueMode[]>(["pickup"]);
  const [tableCount, setTableCount] = React.useState(8);
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
  const [look, setLook] = React.useState<LookKey>("classic");
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
          if (typeof d.tableCount === "number") setTableCount(d.tableCount);
          if (Array.isArray(d.locales) && d.locales.length > 0) setLocales(d.locales);
          if (typeof d.phone === "string") setPhone(d.phone);
          if (typeof d.city === "string") setCity(d.city);
          if (typeof d.customCity === "boolean") setCustomCity(d.customCity);
          if (typeof d.look === "string" && isLookKey(d.look)) setLook(d.look);
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
        look,
        modes,
        tableCount,
        locales,
        phone,
        city,
        customCity,
      };
      sessionStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
    } catch {
      // Storage full/blocked — persistence is best-effort.
    }
  }, [hydrated, phase, cursor, vertical, name, sections, look, modes, tableCount, locales, phone, city, customCity]);

  const steps = buildSteps(sections, modes);
  const safeCursor = Math.min(Math.max(cursor, 0), steps.length - 1);
  const current = steps[safeCursor];
  const progressPct = Math.round(((safeCursor + 1) / steps.length) * 100);

  const goNext = () => {
    setError(null);
    setCursor(Math.min(safeCursor + 1, steps.length - 1));
  };
  const goBack = () => {
    setError(null);
    setCursor(Math.max(safeCursor - 1, 0));
  };

  const pickVertical = async (key: ShopVertical) => {
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
              suggestionSlug: i.suggestionSlug,
              untouched: Boolean(
                i.suggested &&
                  i.name.trim() === i.suggested.name &&
                  parseSum(i.priceSum) * 100 === i.suggested.priceCents,
              ),
            })),
        })),
      look,
      modes,
      tableCount: modes.includes("dine_in") ? tableCount : 0,
      locales,
      phone: phone.trim(),
      city: opts.includeCity ? city.trim() : "",
    };
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
      setPhase("form");
      setError(res.error);
      return;
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
        aria-label={wizardCopy.common.progressLabel}
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
          {wizardCopy.common.back}
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

  const continueButton = (onClick: () => void, label = wizardCopy.common.continue, disabled = false) => (
    <Button type="button" className="mt-6 w-full" onClick={onClick} disabled={busy || disabled}>
      {busy ? <Loader2 className="animate-spin" /> : null}
      {label}
    </Button>
  );

  const previewSections: PreviewSection[] = sections
    .filter((s) => s.checked && s.name.trim())
    .map((s) => ({
      name: s.name,
      items: s.items
        .filter((i) => i.checked && i.name.trim())
        .map((i) => ({ name: i.name, priceCents: parseSum(i.priceSum) * 100 })),
    }));

  // ── building / reveal phases override the step machine ───────────────────
  if (phase === "building") {
    const stages = wizardCopy.building.stages.filter(
      (_, i) =>
        i !== wizardCopy.building.tablesStageIndex ||
        (modes.includes("dine_in") && tableCount > 0),
    );
    return <BuildingScreen stages={stages} />;
  }

  if (phase === "reveal" && shop) {
    return (
      <section key="reveal">
        <div
          role="progressbar"
          aria-label={wizardCopy.common.progressLabel}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={100}
          className="h-1 w-full overflow-hidden rounded-full bg-muted"
        >
          <div className="h-full w-full rounded-full bg-primary" />
        </div>
        <h1 className="mt-8 text-2xl font-semibold tracking-tight">
          {fmt(wizardCopy.reveal.title, { name: name.trim() })}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {wizardCopy.reveal.subtitle}
        </p>
        <div className="mx-auto mt-6 w-full max-w-[300px] overflow-hidden rounded-[2rem] border-4 border-foreground/80 bg-background">
          <div className="h-[540px] overflow-hidden">
            <WizardLookPreview
              look={look}
              shopName={name.trim()}
              sections={previewSections}
              maxSections={3}
              maxItemsPerSection={3}
            />
          </div>
        </div>
        <Button asChild className="mt-6 w-full">
          <Link href={`/dashboard/${shop.orgSlug}/${shop.catalogSlug}/items`}>
            {wizardCopy.reveal.cta}
          </Link>
        </Button>
      </section>
    );
  }

  // ── ① type ────────────────────────────────────────────────────────────────
  if (current.kind === "type") {
    return (
      <section key="type" aria-labelledby="onboarding-heading">
        {header(wizardCopy.type.title, wizardCopy.type.subtitle, false)}
        <div className="mt-6 flex flex-col gap-2">
          {VERTICAL_KEYS.map((key) => {
            const { label, description, icon: Icon } = VERTICALS[key];
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
      </section>
    );
  }

  // ── ② name ────────────────────────────────────────────────────────────────
  if (current.kind === "name") {
    return (
      <section key="name">
        {header(wizardCopy.name.title, wizardCopy.name.subtitle)}
        <form
          className="mt-6 flex flex-col gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (name.trim()) goNext();
          }}
        >
          <Label htmlFor="wizard-name">{wizardCopy.name.label}</Label>
          <Input
            id="wizard-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={wizardCopy.name.placeholder}
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
          wizardCopy.sections.title,
          vertical
            ? fmt(wizardCopy.sections.subtitleVertical, {
                vertical: VERTICALS[vertical].label.toLowerCase(),
              })
            : wizardCopy.sections.subtitleBare,
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
                  {fmt(wizardCopy.sections.suggestedCount, { n: s.items.length })}
                </span>
              ) : null}
            </label>
          ))}
          <AddRow placeholder={wizardCopy.sections.addPlaceholder} onAdd={addSection} />
        </div>
        {continueButton(goNext)}
      </section>
    );
  }

  // ── ④…N items — one screen per checked section ────────────────────────────
  if (current.kind === "items") {
    const section = sections.find((s) => s.key === current.sectionKey);
    if (!section) {
      // Stale draft pointer (section was unchecked elsewhere) — step past it.
      return (
        <section key="items-stale">
          {header(wizardCopy.sections.title, wizardCopy.sections.subtitleBare)}
          {continueButton(goNext)}
        </section>
      );
    }
    const patchItem = (iKey: string, patch: Partial<ItemDraft>) =>
      setSections((prev) =>
        prev.map((s) =>
          s.key === section.key
            ? { ...s, items: s.items.map((i) => (i.key === iKey ? { ...i, ...patch } : i)) }
            : s,
        ),
      );
    const addItem = (itemName: string, priceSum: string) =>
      setSections((prev) =>
        prev.map((s) =>
          s.key === section.key
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
      <section key={`items-${section.key}`}>
        {header(section.name, wizardCopy.items.subtitle)}
        <div className="mt-6 flex flex-col gap-2">
          {section.items.map((i) => (
            <div
              key={i.key}
              className={cn(
                "flex min-h-12 items-center gap-2 rounded-lg border bg-card px-3 py-2",
                !i.checked && "opacity-50",
              )}
            >
              <Checkbox
                checked={i.checked}
                onCheckedChange={() => patchItem(i.key, { checked: !i.checked })}
                aria-label={fmt(wizardCopy.items.includeAria, { name: i.name })}
              />
              <Input
                value={i.name}
                onChange={(e) => patchItem(i.key, { name: e.target.value })}
                maxLength={80}
                aria-label={wizardCopy.items.nameAria}
                className="h-8 min-w-0 flex-1 border-transparent px-2 shadow-none focus-visible:border-input"
              />
              <div className="flex shrink-0 items-center gap-1">
                <Input
                  value={formatSum(i.priceSum)}
                  onChange={(e) =>
                    patchItem(i.key, {
                      priceSum: e.target.value.replace(/[^\d]/g, ""),
                    })
                  }
                  inputMode="numeric"
                  aria-label={wizardCopy.items.priceAria}
                  className="h-8 w-24 border-transparent px-2 text-right font-mono tabular-nums shadow-none focus-visible:border-input"
                />
                <span className="text-xs text-muted-foreground">
                  {wizardCopy.items.currencySuffix}
                </span>
              </div>
            </div>
          ))}
          <AddRow
            placeholder={wizardCopy.items.addPlaceholder}
            withPrice
            onAddWithPrice={addItem}
          />
        </div>
        {continueButton(goNext)}
      </section>
    );
  }

  // ── look — tappable storefront presets, live mini-previews ───────────────
  if (current.kind === "look") {
    return (
      <section key="look">
        {header(wizardCopy.look.title, wizardCopy.look.subtitle)}
        <div className="mt-6 grid grid-cols-2 gap-3">
          {LOOK_KEYS.map((key) => {
            const preset = wizardCopy.look.presets[key];
            const selected = look === key;
            // The preview embeds real storefront chrome (its headers carry
            // their own buttons), so the card can't BE a <button> — the tap
            // target is an overlay button layered over the inert preview.
            return (
              <div
                key={key}
                className={cn(
                  "relative flex flex-col overflow-hidden rounded-lg border bg-card",
                  selected && "border-primary ring-1 ring-primary",
                )}
              >
                <span className="relative block h-44 overflow-hidden border-b bg-background">
                  <span
                    className="absolute left-0 top-0 block origin-top-left"
                    style={{ width: 380, transform: "scale(0.42)" }}
                  >
                    <WizardLookPreview
                      look={key}
                      shopName={name.trim() || wizardCopy.name.placeholder}
                      sections={previewSections}
                      maxSections={2}
                      maxItemsPerSection={2}
                    />
                  </span>
                  {selected ? (
                    <span className="absolute right-2 top-2 flex size-6 items-center justify-center rounded-full bg-primary text-primary-foreground">
                      <Check className="size-4" />
                    </span>
                  ) : null}
                </span>
                <span className="px-3 py-2">
                  <span className="block text-sm font-medium">{preset.label}</span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {preset.hint}
                  </span>
                </span>
                <button
                  type="button"
                  onClick={() => setLook(key)}
                  aria-pressed={selected}
                  className="absolute inset-0 rounded-lg transition-colors hover:bg-accent/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <span className="sr-only">{preset.label}</span>
                </button>
              </div>
            );
          })}
        </div>
        {continueButton(goNext)}
      </section>
    );
  }

  // ── modes ─────────────────────────────────────────────────────────────────
  if (current.kind === "modes") {
    const toggleMode = (m: VenueMode) =>
      setModes((prev) => (prev.includes(m) ? prev.filter((x) => x !== m) : [...prev, m]));
    const availableModes = vertical
      ? VERTICALS[vertical].allowedModes
      : (Object.keys(wizardCopy.modes.labels) as VenueMode[]);
    return (
      <section key="modes">
        {header(wizardCopy.modes.title, wizardCopy.modes.subtitle)}
        <div className="mt-6 flex flex-col gap-2">
          {availableModes.map((m) => (
            <label
              key={m}
              className="flex min-h-12 cursor-pointer items-center gap-3 rounded-lg border bg-card px-4 py-2.5 transition-colors hover:bg-accent"
            >
              <Checkbox checked={modes.includes(m)} onCheckedChange={() => toggleMode(m)} />
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="text-sm font-medium">{wizardCopy.modes.labels[m].label}</span>
                <span className="truncate text-xs text-muted-foreground">
                  {wizardCopy.modes.labels[m].hint}
                </span>
              </span>
            </label>
          ))}
        </div>
        {continueButton(goNext, wizardCopy.common.continue, modes.length === 0)}
        {modes.length === 0 ? (
          <p className="mt-2 text-center text-xs text-destructive">
            {wizardCopy.modes.atLeastOne}
          </p>
        ) : null}
      </section>
    );
  }

  // ── tables (dine-in only) ─────────────────────────────────────────────────
  if (current.kind === "tables") {
    return (
      <section key="tables">
        {header(wizardCopy.tables.title, wizardCopy.tables.subtitle)}
        <div className="mt-6 flex items-center justify-between gap-3 rounded-lg border bg-card px-4 py-3">
          <div className="min-w-0">
            <p className="text-sm font-medium">{wizardCopy.tables.cardTitle}</p>
            <p className="text-xs text-muted-foreground">{wizardCopy.tables.cardHint}</p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="size-9"
              onClick={() => setTableCount((n) => Math.max(0, n - 1))}
              aria-label={wizardCopy.tables.fewerAria}
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
              aria-label={wizardCopy.tables.moreAria}
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
        {header(wizardCopy.languages.title, wizardCopy.languages.subtitle)}
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
                    {wizardCopy.languages.defaultBadge}
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
                      {wizardCopy.languages.makeDefault}
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="size-8 shrink-0 text-muted-foreground"
                      onClick={() => removeLocale(l.code)}
                      aria-label={fmt(wizardCopy.languages.removeAria, {
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

  // ── phone ─────────────────────────────────────────────────────────────────
  if (current.kind === "phone") {
    return (
      <section key="phone">
        {header(wizardCopy.phone.title, wizardCopy.phone.subtitle)}
        <form
          className="mt-6 flex flex-col gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            goNext();
          }}
        >
          <Label htmlFor="wizard-phone">{wizardCopy.phone.label}</Label>
          <Input
            id="wizard-phone"
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder={wizardCopy.phone.placeholder}
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
            {wizardCopy.phone.skip}
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
      {header(wizardCopy.city.title, wizardCopy.city.subtitle)}
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
            {wizardCopy.city.otherChip}
          </Button>
        </div>
        {customCity ? (
          <div className="flex flex-col gap-2">
            <Label htmlFor="wizard-city">{wizardCopy.city.customLabel}</Label>
            <Input
              id="wizard-city"
              value={city}
              onChange={(e) => setCity(e.target.value)}
              placeholder={wizardCopy.city.customPlaceholder}
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
              {wizardCopy.city.creating}
            </>
          ) : (
            wizardCopy.city.create
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
              {wizardCopy.city.creating}
            </>
          ) : (
            wizardCopy.city.skip
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
        {wizardCopy.building.title}
      </h1>
      <p className="mt-1 text-sm text-muted-foreground">
        {wizardCopy.building.subtitle}
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

function AddRow({
  placeholder,
  withPrice = false,
  onAdd,
  onAddWithPrice,
}: {
  placeholder: string;
  withPrice?: boolean;
  onAdd?: (name: string) => void;
  onAddWithPrice?: (name: string, priceSum: string) => void;
}) {
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
            aria-label={wizardCopy.items.priceAria}
            className="h-8 w-24 text-right font-mono tabular-nums"
          />
          <span className="text-xs text-muted-foreground">
            {wizardCopy.items.currencySuffix}
          </span>
        </div>
      ) : null}
      <Button
        type="button"
        size="sm"
        className="shrink-0"
        onClick={commit}
        disabled={!value.trim()}
      >
        {wizardCopy.common.add}
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="size-8 shrink-0 text-muted-foreground"
        onClick={reset}
        aria-label={wizardCopy.common.cancelAdd}
      >
        <X className="size-4" />
      </Button>
    </div>
  );
}
