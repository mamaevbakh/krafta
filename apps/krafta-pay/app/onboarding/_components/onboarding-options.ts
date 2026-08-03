import {
  Boxes,
  Briefcase,
  Dumbbell,
  GraduationCap,
  MoreHorizontal,
  Radio,
  Send,
  type LucideIcon,
} from "lucide-react";

/**
 * Wizard option metadata.
 *
 * Mirrors the shape of Krafta's `verticals.ts` so the two onboarding flows stay
 * recognisably the same product. The keys are single-sourced with the CHECK
 * constraints on `payments.org_profiles` — adding one means a migration plus an
 * entry here.
 */

export type BusinessType =
  | "telegram"
  | "edtech"
  | "saas"
  | "fitness"
  | "media"
  | "services"
  | "other";

/**
 * The segments from the product thesis, in the order we believe they convert.
 * Telegram-first businesses lead because they are the beachhead: technical
 * enough to integrate in an afternoon, and already billing by hand.
 */
export const BUSINESS_TYPES: Record<
  BusinessType,
  { label: string; description: string; icon: LucideIcon }
> = {
  telegram: {
    label: "Telegram bot or paid channel",
    description: "Subscriptions for channel access or a bot service",
    icon: Send,
  },
  edtech: {
    label: "Online school or courses",
    description: "Monthly course access, cohort renewals",
    icon: GraduationCap,
  },
  saas: {
    label: "SaaS or IT product",
    description: "Recurring plans for a web or mobile product",
    icon: Boxes,
  },
  fitness: {
    label: "Gym, club or coworking",
    description: "Memberships billed every month",
    icon: Dumbbell,
  },
  media: {
    label: "Media or content",
    description: "Paywalls, premium tiers, supporter plans",
    icon: Radio,
  },
  services: {
    label: "Agency or professional services",
    description: "Retainers and recurring client billing",
    icon: Briefcase,
  },
  other: {
    label: "Something else",
    description: "Tell us later — this only tailors your setup",
    icon: MoreHorizontal,
  },
};

export const BUSINESS_TYPE_KEYS = Object.keys(BUSINESS_TYPES) as BusinessType[];

export type LegalForm = "legal_entity" | "individual_entrepreneur" | "self_employed";

/**
 * Legal form decides which tax identifier is correct — this is not a
 * bookkeeping question.
 *
 * `payments.tax_schemas` for UZ (`UZ_AUTOFISCAL_V1`) declares
 * `tax_identity_types: ["TIN", "PINFL"]`, and the CHECK on
 * `org_provider_accounts.metadata` accepts only those two. A legal entity and
 * an individual entrepreneur both file under a 9-digit ИНН; a self-employed
 * person is identified by their 14-digit ПИНФЛ.
 */
export const LEGAL_FORMS: Record<
  LegalForm,
  {
    label: string;
    description: string;
    identityType: "TIN" | "PINFL";
    identityLabel: string;
    identityDigits: number;
  }
> = {
  legal_entity: {
    label: "Legal entity",
    description: "ООО, АО — a registered company",
    identityType: "TIN",
    identityLabel: "ИНН",
    identityDigits: 9,
  },
  individual_entrepreneur: {
    label: "Individual entrepreneur",
    description: "ИП — registered in your own name",
    identityType: "TIN",
    identityLabel: "ИНН",
    identityDigits: 9,
  },
  self_employed: {
    label: "Self-employed",
    description: "Самозанятый — identified by ПИНФЛ",
    identityType: "PINFL",
    identityLabel: "ПИНФЛ",
    identityDigits: 14,
  },
};

export const LEGAL_FORM_KEYS = Object.keys(LEGAL_FORMS) as LegalForm[];

export type BillingModel = "subscriptions" | "one_off" | "both";

export const BILLING_MODELS: Record<
  BillingModel,
  { label: string; description: string }
> = {
  subscriptions: {
    label: "Recurring subscriptions",
    description: "Charge the same customer every month",
  },
  one_off: {
    label: "One-off payments",
    description: "Send a payment link, get paid once",
  },
  both: {
    label: "Both",
    description: "Subscriptions plus the occasional one-off charge",
  },
};

export const BILLING_MODEL_KEYS = Object.keys(BILLING_MODELS) as BillingModel[];

export type ProviderStatus = "atmos" | "uzum" | "both" | "none";

/**
 * The most load-bearing answer in the wizard. It decides where onboarding ENDS:
 * a merchant who already has an acquirer finishes by pasting keys and can take
 * money today; one who doesn't needs to be told how to apply, not dropped onto
 * a Providers page they physically cannot use.
 */
export const PROVIDER_STATUSES: Record<
  ProviderStatus,
  { label: string; description: string }
> = {
  atmos: {
    label: "Yes — Atmos",
    description: "Cards are collected on your checkout page, no redirect",
  },
  uzum: {
    label: "Yes — Uzum",
    description: "Customers attach a card on Uzum, then we charge it",
  },
  both: {
    label: "Yes — both",
    description: "You can offer either at checkout",
  },
  none: {
    label: "Not yet",
    description: "We'll show you how to get one",
  },
};

export const PROVIDER_STATUS_KEYS = Object.keys(PROVIDER_STATUSES) as ProviderStatus[];

/** Digits only — merchants paste these with spaces and dashes. */
export function normalizeTaxIdentity(value: string): string {
  return value.replace(/\D/g, "");
}

export function validateTaxIdentity(
  value: string,
  legalForm: LegalForm,
): { ok: true } | { ok: false; message: string } {
  const digits = normalizeTaxIdentity(value);
  const { identityLabel, identityDigits } = LEGAL_FORMS[legalForm];

  if (digits.length === 0) {
    return { ok: false, message: `Enter your ${identityLabel}.` };
  }
  if (digits.length !== identityDigits) {
    return {
      ok: false,
      // Says what is wrong AND what right looks like — "invalid" alone sends
      // someone hunting through paperwork for a rule we already know.
      message: `${identityLabel} is ${identityDigits} digits. You entered ${digits.length}.`,
    };
  }
  return { ok: true };
}
