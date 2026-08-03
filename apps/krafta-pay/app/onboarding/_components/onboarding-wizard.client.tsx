"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, ChevronRight, ExternalLink, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { buttonVariants } from "@/components/ui/button-variants";
import { LinkButton } from "@/components/ui/link-button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/locales/context";
import {
  BILLING_MODEL_KEYS,
  BUSINESS_TYPE_ICONS,
  BUSINESS_TYPE_KEYS,
  LEGAL_FORMS,
  LEGAL_FORM_KEYS,
  PROVIDER_STATUS_KEYS,
  normalizeTaxIdentity,
  validateTaxIdentity,
  type TaxIdentityResult,
  type BillingModel,
  type BusinessType,
  type LegalForm,
  type ProviderStatus,
} from "./onboarding-options";

/**
 * Krafta Pay merchant onboarding.
 *
 * Deliberately the same shape as Krafta's shop wizard — narrow column, thin
 * progress bar, one decision per screen, tile rows that advance on tap — so the
 * two products read as one company rather than two teams. The steps differ
 * because the questions differ: Krafta is building a storefront, this is
 * establishing who is billing whom.
 *
 * Country is not asked. Uzbekistan is the only market, and a select with one
 * option is a question that costs a tap and answers nothing.
 */

type Step = "type" | "company" | "billing" | "contact" | "provider";

const STEPS: Step[] = ["type", "company", "billing", "contact", "provider"];
const DRAFT_KEY = "krafta-pay-onboarding-draft";

type Draft = {
  step: number;
  businessType: BusinessType | null;
  name: string;
  legalForm: LegalForm | null;
  taxIdentity: string;
  billingModel: BillingModel | null;
  phone: string;
  telegram: string;
};

const EMPTY_DRAFT: Draft = {
  step: 0,
  businessType: null,
  name: "",
  legalForm: null,
  taxIdentity: "",
  billingModel: null,
  phone: "",
  telegram: "",
};

type CreatedAccount = { orgSlug: string; providerStatus: ProviderStatus };

export function OnboardingWizard() {
  const router = useRouter();
  const t = useT();
  const [draft, setDraft] = React.useState<Draft>(EMPTY_DRAFT);
  const [hydrated, setHydrated] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  // Which provider tile was tapped, so only THAT one spins. A global busy flag
  // put a spinner on all four at once, which reads as "everything is happening".
  const [submitting, setSubmitting] = React.useState<ProviderStatus | null>(null);
  // State updates are async, so `if (busy) return` does not stop two clicks
  // fired within the same frame — both read the pre-update value and both POST.
  // A ref flips synchronously.
  const inFlight = React.useRef(false);
  const [error, setError] = React.useState<string | null>(null);
  const [taxError, setTaxError] = React.useState<string | null>(null);
  const [done, setDone] = React.useState<CreatedAccount | null>(null);

  // Restore a half-finished wizard. Someone who tabs away to look up their ИНН
  // — which is the single most likely interruption in this flow — should not
  // come back to an empty first screen.
  React.useEffect(() => {
    try {
      const raw = sessionStorage.getItem(DRAFT_KEY);
      if (raw) setDraft({ ...EMPTY_DRAFT, ...(JSON.parse(raw) as Partial<Draft>) });
    } catch {
      // A corrupt draft is not worth failing over; start fresh.
    }
    setHydrated(true);
  }, []);

  React.useEffect(() => {
    if (!hydrated) return;
    try {
      sessionStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
    } catch {
      // Private-mode / quota. Persistence is a convenience, not a requirement.
    }
  }, [draft, hydrated]);

  const step = STEPS[Math.min(draft.step, STEPS.length - 1)];
  const progressPct = done ? 100 : Math.round((draft.step / STEPS.length) * 100);

  const patch = (next: Partial<Draft>) => setDraft((d) => ({ ...d, ...next }));
  const goNext = () => patch({ step: Math.min(draft.step + 1, STEPS.length - 1) });
  const goBack = () => {
    setError(null);
    patch({ step: Math.max(draft.step - 1, 0) });
  };

  async function submit(providerStatus: ProviderStatus) {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setSubmitting(providerStatus);
    setError(null);

    try {
      const response = await fetch("/api/dashboard/onboarding", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: draft.name.trim(),
          businessType: draft.businessType,
          legalForm: draft.legalForm,
          taxIdentity: normalizeTaxIdentity(draft.taxIdentity),
          billingModel: draft.billingModel,
          contactPhone: draft.phone.trim() || null,
          telegram: draft.telegram.trim() || null,
          providerStatus,
        }),
      });
      const payload = (await response.json()) as {
        account?: { orgSlug: string };
        error?: string;
      };

      if (!response.ok || !payload.account) {
        setError(t(errorKey(payload.error)));
        return;
      }

      try {
        sessionStorage.removeItem(DRAFT_KEY);
      } catch {
        // Inert once the account exists.
      }
      setDone({ orgSlug: payload.account.orgSlug, providerStatus });
    } catch {
      setError(t("onboarding.error.network"));
    } finally {
      inFlight.current = false;
      setBusy(false);
      setSubmitting(null);
    }
  }

  // Avoid rendering step 1 for a frame before the draft restores — that flash
  // is what makes a resumed wizard feel like it lost your answers.
  if (!hydrated) {
    return <div className="h-1 w-full overflow-hidden rounded-full bg-muted" aria-hidden />;
  }

  const header = (title: string, subtitle: string, showBack = true) => (
    <>
      <div
        role="progressbar"
        aria-label={t("onboarding.progress")}
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
          {t("onboarding.back")}
        </Button>
      ) : null}
      <h1 className={cn("text-2xl font-semibold tracking-tight", !showBack && "mt-8")}>{title}</h1>
      <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>
    </>
  );

  /** Turn a validation result into a sentence in the active language. */
  const taxMessage = (result: TaxIdentityResult): string | null => {
    if (result.ok) return null;
    return result.reason === "required"
      ? t("onboarding.company.taxRequired", { label: result.label })
      : t("onboarding.company.taxLength", {
          label: result.label,
          expected: result.expected,
          actual: result.actual,
        });
  };

  const errorNote = error ? (
    <p className="mt-4 text-sm text-destructive" role="alert">
      {error}
    </p>
  ) : null;

  // ── done ──────────────────────────────────────────────────────────────────
  if (done) {
    const hasProvider = done.providerStatus !== "none";
    return (
      <section key="done">
        <div
          role="progressbar"
          aria-label={t("onboarding.progress")}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={100}
          className="h-1 w-full overflow-hidden rounded-full bg-muted"
        >
          <div className="h-full w-full rounded-full bg-primary" />
        </div>
        <h1 className="mt-8 text-2xl font-semibold tracking-tight">
          {t("onboarding.done.title", { name: draft.name.trim() })}
        </h1>

        {/* The whole reason the provider question exists: two genuinely
            different next steps, instead of one dead end. */}
        {hasProvider ? (
          <>
            <p className="mt-1 text-sm text-muted-foreground">
              {t("onboarding.done.hasProvider")}
            </p>
            <LinkButton href={`/dashboard/org/${done.orgSlug}/providers`} className="mt-6 w-full">
              {t("onboarding.done.connectProvider")}
            </LinkButton>
            <LinkButton
              href={`/dashboard/org/${done.orgSlug}`}
              variant="ghost"
              className="mt-2 w-full"
            >
              {t("onboarding.done.skipForNow")}
            </LinkButton>
          </>
        ) : (
          <>
            <p className="mt-1 text-sm text-muted-foreground">
              {t("onboarding.done.noProvider")}
            </p>
            <div className="mt-6 rounded-lg border bg-card p-4">
              <p className="text-sm font-medium">{t("onboarding.done.atmosTitle")}</p>
              <p className="mt-1 text-sm text-muted-foreground">
                {t("onboarding.done.atmosBody", {
                  label: draft.legalForm ? LEGAL_FORMS[draft.legalForm].identityLabel : "ИНН",
                })}
              </p>
              <a
                href="https://atmos.uz"
                target="_blank"
                rel="noreferrer noopener"
                className={buttonVariants({ variant: "outline", size: "sm", className: "mt-3" })}
              >
                atmos.uz
                <ExternalLink className="size-3.5" />
              </a>
            </div>
            <LinkButton href={`/dashboard/org/${done.orgSlug}`} className="mt-6 w-full">
              {t("onboarding.done.goToDashboard")}
            </LinkButton>
          </>
        )}
      </section>
    );
  }

  // ── ① business type ───────────────────────────────────────────────────────
  if (step === "type") {
    return (
      <section key="type" aria-labelledby="onboarding-heading">
        {header(t("onboarding.type.title"), t("onboarding.type.subtitle"), false)}
        <div className="mt-6 flex flex-col gap-2">
          {BUSINESS_TYPE_KEYS.map((key) => {
            const Icon = BUSINESS_TYPE_ICONS[key];
            return (
              <button
                key={key}
                type="button"
                disabled={busy}
                onClick={() => {
                  patch({ businessType: key });
                  goNext();
                }}
                className="flex min-h-14 w-full items-center gap-3 rounded-lg border bg-card px-4 py-3 text-left transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
              >
                <Icon className="size-5 shrink-0 text-muted-foreground" />
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="text-sm font-medium">{t(`onboarding.type.${key}`)}</span>
                  <span className="truncate text-xs text-muted-foreground">
                    {t(`onboarding.type.${key}.description`)}
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

  // ── ② company ─────────────────────────────────────────────────────────────
  if (step === "company") {
    const legalForm = draft.legalForm;
    const identity = legalForm ? LEGAL_FORMS[legalForm] : null;
    const canContinue =
      draft.name.trim().length > 0 &&
      !!legalForm &&
      validateTaxIdentity(draft.taxIdentity, legalForm).ok;

    return (
      <section key="company">
        {header(t("onboarding.company.title"), t("onboarding.company.subtitle"))}
        <form
          className="mt-6 flex flex-col gap-5"
          onSubmit={(event) => {
            event.preventDefault();
            if (!legalForm) return;
            const check = validateTaxIdentity(draft.taxIdentity, legalForm);
            if (!check.ok) {
              setTaxError(taxMessage(check));
              return;
            }
            setTaxError(null);
            goNext();
          }}
        >
          <div className="flex flex-col gap-2">
            <Label htmlFor="company-name">{t("onboarding.company.name")}</Label>
            <Input
              id="company-name"
              value={draft.name}
              onChange={(e) => patch({ name: e.target.value })}
              placeholder={t("onboarding.company.namePlaceholder")}
              autoComplete="organization"
              maxLength={120}
              autoFocus
              required
            />
          </div>

          <fieldset className="flex flex-col gap-2">
            <legend className="text-sm font-medium leading-none">{t("onboarding.company.legalForm")}</legend>
            <div className="mt-1 flex flex-col gap-2">
              {LEGAL_FORM_KEYS.map((key) => {
                const selected = legalForm === key;
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => {
                      patch({ legalForm: key });
                      setTaxError(null);
                    }}
                    aria-pressed={selected}
                    className={cn(
                      "flex min-h-14 w-full items-center gap-3 rounded-lg border px-4 py-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                      selected ? "border-foreground bg-accent" : "bg-card hover:bg-accent",
                    )}
                  >
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="text-sm font-medium">{t(`onboarding.legalForm.${key}`)}</span>
                      <span className="truncate text-xs text-muted-foreground">
                        {t(`onboarding.legalForm.${key}.description`)}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          </fieldset>

          {/* Only after a legal form is chosen — the label and the digit count
              both depend on it, and an ИНН/ПИНФЛ field that changes its own
              rules under you is worse than one that appears when it applies. */}
          {identity ? (
            <div className="flex flex-col gap-2">
              <Label htmlFor="tax-identity">{identity.identityLabel}</Label>
              <Input
                id="tax-identity"
                value={draft.taxIdentity}
                onChange={(e) => {
                  patch({ taxIdentity: e.target.value });
                  if (taxError) setTaxError(null);
                }}
                onBlur={() => {
                  if (!draft.taxIdentity.trim() || !legalForm) return;
                  setTaxError(taxMessage(validateTaxIdentity(draft.taxIdentity, legalForm)));
                }}
                inputMode="numeric"
                placeholder={"0".repeat(identity.identityDigits)}
                className="font-mono tabular-nums"
                aria-invalid={taxError ? true : undefined}
                aria-describedby="tax-identity-hint"
              />
              <p
                id="tax-identity-hint"
                className={cn("text-xs", taxError ? "text-destructive" : "text-muted-foreground")}
              >
                {taxError ?? t("onboarding.company.taxHint", { digits: identity.identityDigits })}
              </p>
            </div>
          ) : null}

          {errorNote}

          <Button type="submit" className="w-full" disabled={busy || !canContinue}>
            {t("onboarding.continue")}
          </Button>
        </form>
      </section>
    );
  }

  // ── ③ billing model ───────────────────────────────────────────────────────
  if (step === "billing") {
    return (
      <section key="billing">
        {header(t("onboarding.billing.title"), t("onboarding.billing.subtitle"))}
        <div className="mt-6 flex flex-col gap-2">
          {BILLING_MODEL_KEYS.map((key) => (
            <button
              key={key}
              type="button"
              disabled={busy}
              onClick={() => {
                patch({ billingModel: key });
                goNext();
              }}
              className="flex min-h-14 w-full items-center gap-3 rounded-lg border bg-card px-4 py-3 text-left transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
            >
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="text-sm font-medium">{t(`onboarding.billing.${key}`)}</span>
                <span className="truncate text-xs text-muted-foreground">
                  {t(`onboarding.billing.${key}.description`)}
                </span>
              </span>
              <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
            </button>
          ))}
        </div>
      </section>
    );
  }

  // ── ④ contact ─────────────────────────────────────────────────────────────
  if (step === "contact") {
    return (
      <section key="contact">
        {header(t("onboarding.contact.title"), t("onboarding.contact.subtitle"))}
        <form
          className="mt-6 flex flex-col gap-5"
          onSubmit={(event) => {
            event.preventDefault();
            goNext();
          }}
        >
          <div className="flex flex-col gap-2">
            <Label htmlFor="contact-phone">{t("onboarding.contact.phone")}</Label>
            <Input
              id="contact-phone"
              value={draft.phone}
              onChange={(e) => patch({ phone: e.target.value })}
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              placeholder="+998 90 123 45 67"
              autoFocus
            />
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="contact-telegram">{t("onboarding.contact.telegram")}</Label>
            <Input
              id="contact-telegram"
              value={draft.telegram}
              onChange={(e) => patch({ telegram: e.target.value })}
              placeholder="@username"
              aria-describedby="telegram-hint"
            />
            <p id="telegram-hint" className="text-xs text-muted-foreground">
              {t("onboarding.contact.telegramHint")}
            </p>
          </div>

          {errorNote}

          <div className="flex flex-col gap-2">
            <Button type="submit" className="w-full">
              {t("onboarding.continue")}
            </Button>
            {/* Both fields are genuinely optional — we already have the email
                they signed up with. Forcing a contact method here would be
                friction charged for nothing. */}
            <Button type="button" variant="ghost" className="w-full" onClick={goNext}>
              {t("onboarding.skip")}
            </Button>
          </div>
        </form>
      </section>
    );
  }

  // ── ⑤ provider ────────────────────────────────────────────────────────────
  return (
    <section key="provider">
      {header(t("onboarding.provider.title"), t("onboarding.provider.subtitle"))}
      <div className="mt-6 flex flex-col gap-2">
        {PROVIDER_STATUS_KEYS.map((key) => (
            <button
              key={key}
              type="button"
              disabled={busy}
              onClick={() => void submit(key)}
              className="flex min-h-14 w-full items-center gap-3 rounded-lg border bg-card px-4 py-3 text-left transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
            >
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="text-sm font-medium">{t(`onboarding.provider.${key}`)}</span>
                <span className="truncate text-xs text-muted-foreground">
                  {t(`onboarding.provider.${key}.description`)}
                </span>
              </span>
              {submitting === key ? (
                <Loader2 className="size-4 shrink-0 animate-spin text-muted-foreground" />
              ) : (
                <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
              )}
            </button>
        ))}
      </div>
      {errorNote}
    </section>
  );
}

/** Map a server error code to a catalog key. */
function errorKey(code: string | undefined) {
  switch (code) {
    case "account_already_exists":
      return "onboarding.error.exists" as const;
    case "name_required":
      return "onboarding.error.nameRequired" as const;
    case "tax_identity_invalid":
      return "onboarding.error.taxInvalid" as const;
    case "tax_schema_missing":
      return "onboarding.error.taxSchema" as const;
    default:
      return "onboarding.error.generic" as const;
  }
}
