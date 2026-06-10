"use client";

// KRA-42 wizard v2 / ADR 0005 §2 (amended) — guided seeding.
//
//   ① type → ② name → ③ sections → ④ items + prices → ⑤ order modes
//   (+ table count when dine-in) → ⑥ languages → ⑦ contacts (skippable)
//   → single submit → Studio.
//
// Every screen has a one-tap fast path: suggestions arrive pre-checked from
// vertical_templates, modes/languages carry vertical defaults, contacts can
// skip. Nothing is created until the final submit, so abandoning mid-wizard
// leaves zero rows. Suggestions the merchant keeps untouched retain their
// template richness (size variations, UZ/EN translations) and the seeded_at
// demo marker; anything renamed, re-priced or added is theirs from birth.

import * as React from "react";
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
import { cn } from "@/lib/utils";

import {
  createShopFromWizard,
  getVerticalSuggestions,
  type WizardPayload,
} from "./actions";
import { VERTICALS, VERTICAL_KEYS, type ShopVertical } from "./verticals";

const STEPS = ["type", "name", "sections", "items", "modes", "languages", "contacts"] as const;
type StepKey = (typeof STEPS)[number];

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

type VenueMode = "dine_in" | "pickup" | "delivery";

const MODE_LABELS: Record<VenueMode, { label: string; hint: string }> = {
  dine_in: { label: "Dine-in", hint: "QR on the table, orders to the kitchen" },
  pickup: { label: "Pickup", hint: "Customers order ahead and collect" },
  delivery: { label: "Delivery", hint: "You bring it to them" },
};

function parseSum(value: string): number {
  const n = Number(value.replace(/[^\d]/g, ""));
  return Number.isFinite(n) ? Math.min(n, 10_000_000) : 0;
}

/** UZS always renders with space thousands separators (DESIGN.md i18n). */
function formatSum(digits: string): string {
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, " ");
}

export function OnboardingWizard() {
  const [step, setStep] = React.useState<StepKey>("type");
  const [vertical, setVertical] = React.useState<ShopVertical | null>(null);
  const [name, setName] = React.useState("");
  const [sections, setSections] = React.useState<SectionDraft[]>([]);
  const [modes, setModes] = React.useState<VenueMode[]>(["pickup"]);
  const [tableCount, setTableCount] = React.useState(8);
  const [locales, setLocales] = React.useState<{ uz: boolean; en: boolean }>({
    uz: true,
    en: true,
  });
  const [phone, setPhone] = React.useState("");
  const [city, setCity] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  const stepIndex = STEPS.indexOf(step);

  const pickVertical = async (key: ShopVertical) => {
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
      // Suggestions are a convenience — the merchant can still build from
      // scratch on the sections/items screens.
      setSections([]);
      setModes(["pickup"]);
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
      setModes((res.defaultModes as VenueMode[]).filter((m) => m in MODE_LABELS));
    }
    setVertical(key);
    setStep("name");
  };

  const submit = async (withContacts: boolean) => {
    if (!vertical) return;
    setBusy(true);
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
      modes,
      tableCount: modes.includes("dine_in") ? tableCount : 0,
      locales: (["uz", "en"] as const).filter((l) => locales[l]),
      phone: withContacts ? phone.trim() : "",
      city: withContacts ? city.trim() : "",
    };
    const res = await createShopFromWizard(payload);
    // On success the action redirects; reaching here means an error state.
    setBusy(false);
    if (res?.error) setError(res.error);
  };

  const header = (title: string, subtitle: string, backTo?: StepKey) => (
    <>
      {backTo !== undefined ? (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="-ml-2 mb-4 text-muted-foreground"
          onClick={() => {
            setError(null);
            setStep(backTo);
          }}
          disabled={busy}
        >
          <ArrowLeft className="size-4" />
          Back
        </Button>
      ) : null}
      <p className="text-xs text-muted-foreground">
        Step {stepIndex + 1} of {STEPS.length}
      </p>
      <h1 className="mt-2 text-2xl font-semibold tracking-tight">{title}</h1>
      <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>
    </>
  );

  const continueButton = (onClick: () => void, label = "Continue", disabled = false) => (
    <Button type="button" className="mt-6 w-full" onClick={onClick} disabled={busy || disabled}>
      {busy ? <Loader2 className="animate-spin" /> : null}
      {label}
    </Button>
  );

  // ── ① type ────────────────────────────────────────────────────────────────
  if (step === "type") {
    return (
      <section aria-labelledby="onboarding-heading">
        <p className="text-xs text-muted-foreground">Step 1 of {STEPS.length}</p>
        <h1 id="onboarding-heading" className="mt-2 text-2xl font-semibold tracking-tight">
          What are you opening?
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          We&apos;ll suggest a starter menu you can shape in the next steps.
        </p>
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
  if (step === "name") {
    return (
      <section>
        {header("Name your shop", "Customers see this name. You can change it anytime.", "type")}
        <form
          className="mt-6 flex flex-col gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (name.trim()) setStep("sections");
          }}
        >
          <Label htmlFor="wizard-name">Shop name</Label>
          <Input
            id="wizard-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Чойхона №1"
            maxLength={80}
            required
            autoFocus
            autoComplete="organization"
          />
          {continueButton(() => name.trim() && setStep("sections"))}
        </form>
      </section>
    );
  }

  // ── ③ sections ────────────────────────────────────────────────────────────
  if (step === "sections") {
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
      <section>
        {header(
          "Your menu sections",
          vertical ? `What we'd suggest for a ${VERTICALS[vertical].label.toLowerCase()} — drop or add your own.` : "Drop or add your own.",
          "name",
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
                  {s.items.length} suggested
                </span>
              ) : null}
            </label>
          ))}
          <AddRow placeholder="Add a section (e.g. Десерты)" onAdd={addSection} />
        </div>
        {continueButton(() => setStep("items"))}
      </section>
    );
  }

  // ── ④ items ───────────────────────────────────────────────────────────────
  if (step === "items") {
    const checkedSections = sections.filter((s) => s.checked);
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
      <section>
        {header(
          "Your first items",
          "Set real prices now or keep ours — everything stays editable in the Studio.",
          "sections",
        )}
        <div className="mt-6 flex flex-col gap-6">
          {checkedSections.map((s) => (
            <div key={s.key}>
              <h2 className="mb-2 text-sm font-medium text-muted-foreground">{s.name}</h2>
              <div className="flex flex-col gap-2">
                {s.items.map((i) => (
                  <div
                    key={i.key}
                    className={cn(
                      "flex min-h-12 items-center gap-2 rounded-lg border bg-card px-3 py-2",
                      !i.checked && "opacity-50",
                    )}
                  >
                    <Checkbox
                      checked={i.checked}
                      onCheckedChange={() => patchItem(s.key, i.key, { checked: !i.checked })}
                      aria-label={`Include ${i.name}`}
                    />
                    <Input
                      value={i.name}
                      onChange={(e) => patchItem(s.key, i.key, { name: e.target.value })}
                      maxLength={80}
                      aria-label="Item name"
                      className="h-8 min-w-0 flex-1 border-transparent px-2 shadow-none focus-visible:border-input"
                    />
                    <div className="flex shrink-0 items-center gap-1">
                      <Input
                        value={formatSum(i.priceSum)}
                        onChange={(e) =>
                          patchItem(s.key, i.key, {
                            priceSum: e.target.value.replace(/[^\d]/g, ""),
                          })
                        }
                        inputMode="numeric"
                        aria-label="Price in sums"
                        className="h-8 w-24 border-transparent px-2 text-right font-mono tabular-nums shadow-none focus-visible:border-input"
                      />
                      <span className="text-xs text-muted-foreground">сум</span>
                    </div>
                  </div>
                ))}
                <AddRow
                  placeholder="Add an item"
                  withPrice
                  onAddWithPrice={(n, p) => addItem(s.key, n, p)}
                />
              </div>
            </div>
          ))}
          {checkedSections.length === 0 ? (
            <p className="rounded-lg border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">
              No sections selected — go back and pick at least one, or continue
              with an empty menu.
            </p>
          ) : null}
        </div>
        {continueButton(() => setStep("modes"))}
      </section>
    );
  }

  // ── ⑤ modes ───────────────────────────────────────────────────────────────
  if (step === "modes") {
    const toggleMode = (m: VenueMode) =>
      setModes((prev) => (prev.includes(m) ? prev.filter((x) => x !== m) : [...prev, m]));
    return (
      <section>
        {header("How do customers order?", "Pick what you serve today — you can change this later.", "items")}
        <div className="mt-6 flex flex-col gap-2">
          {(Object.keys(MODE_LABELS) as VenueMode[]).map((m) => (
            <label
              key={m}
              className="flex min-h-12 cursor-pointer items-center gap-3 rounded-lg border bg-card px-4 py-2.5 transition-colors hover:bg-accent"
            >
              <Checkbox checked={modes.includes(m)} onCheckedChange={() => toggleMode(m)} />
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="text-sm font-medium">{MODE_LABELS[m].label}</span>
                <span className="truncate text-xs text-muted-foreground">{MODE_LABELS[m].hint}</span>
              </span>
            </label>
          ))}
        </div>
        {modes.includes("dine_in") ? (
          <div className="mt-4 flex items-center justify-between gap-3 rounded-lg border bg-card px-4 py-3">
            <div className="min-w-0">
              <p className="text-sm font-medium">Tables at your venue</p>
              <p className="text-xs text-muted-foreground">
                We&apos;ll prepare a printable QR code for each table.
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="size-9"
                onClick={() => setTableCount((n) => Math.max(0, n - 1))}
                aria-label="Fewer tables"
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
                aria-label="More tables"
              >
                <Plus className="size-4" />
              </Button>
            </div>
          </div>
        ) : null}
        {continueButton(() => setStep("languages"), "Continue", modes.length === 0)}
        {modes.length === 0 ? (
          <p className="mt-2 text-center text-xs text-destructive">Pick at least one way to order.</p>
        ) : null}
      </section>
    );
  }

  // ── ⑥ languages ───────────────────────────────────────────────────────────
  if (step === "languages") {
    return (
      <section>
        {header(
          "Menu languages",
          "Suggested items come already translated. Your own items can be translated later in the workbench.",
          "modes",
        )}
        <div className="mt-6 flex flex-col gap-2">
          <div className="flex min-h-12 items-center gap-3 rounded-lg border bg-card px-4 py-2.5">
            <Check className="size-4 text-muted-foreground" />
            <span className="min-w-0 flex-1 text-sm font-medium">Русский</span>
            <Badge variant="outline">Default</Badge>
          </div>
          {(
            [
              ["uz", "Oʻzbekcha"],
              ["en", "English"],
            ] as const
          ).map(([code, label]) => (
            <label
              key={code}
              className="flex min-h-12 cursor-pointer items-center gap-3 rounded-lg border bg-card px-4 py-2.5 transition-colors hover:bg-accent"
            >
              <Checkbox
                checked={locales[code]}
                onCheckedChange={() => setLocales((p) => ({ ...p, [code]: !p[code] }))}
              />
              <span className="min-w-0 flex-1 text-sm font-medium">{label}</span>
            </label>
          ))}
        </div>
        {continueButton(() => setStep("contacts"))}
      </section>
    );
  }

  // ── ⑦ contacts ────────────────────────────────────────────────────────────
  return (
    <section>
      {header(
        "How can customers reach you?",
        "Optional — a phone number makes the shop feel open for business.",
        "languages",
      )}
      <form
        className="mt-6 flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          void submit(true);
        }}
      >
        <div className="flex flex-col gap-2">
          <Label htmlFor="wizard-phone">Phone</Label>
          <Input
            id="wizard-phone"
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="+998 90 123 45 67"
            maxLength={32}
            autoComplete="tel"
            disabled={busy}
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="wizard-city">City</Label>
          <Input
            id="wizard-city"
            value={city}
            onChange={(e) => setCity(e.target.value)}
            placeholder="Ташкент"
            maxLength={64}
            autoComplete="address-level2"
            disabled={busy}
          />
        </div>
        {error ? (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        ) : null}
        <Button type="submit" className="w-full" disabled={busy}>
          {busy ? (
            <>
              <Loader2 className="animate-spin" />
              Setting up your shop…
            </>
          ) : (
            "Create my shop"
          )}
        </Button>
        <Button
          type="button"
          variant="ghost"
          className="w-full"
          disabled={busy}
          onClick={() => void submit(false)}
        >
          Skip for now
        </Button>
      </form>
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
            aria-label="Price in sums"
            className="h-8 w-24 text-right font-mono tabular-nums"
          />
          <span className="text-xs text-muted-foreground">сум</span>
        </div>
      ) : null}
      <Button
        type="button"
        size="sm"
        className="shrink-0"
        onClick={commit}
        disabled={!value.trim()}
      >
        Add
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="size-8 shrink-0 text-muted-foreground"
        onClick={reset}
        aria-label="Cancel adding"
      >
        <X className="size-4" />
      </Button>
    </div>
  );
}
