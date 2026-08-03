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
 * Wizard option metadata — structure only, no copy.
 *
 * Mirrors the shape of Krafta's `verticals.ts` so the two onboarding flows stay
 * recognisably the same product. Labels and descriptions live in the message
 * catalog under `onboarding.*`, keyed off the same identifiers, so adding a
 * language never touches this file.
 *
 * The keys are single-sourced with the CHECK constraints on
 * `payments.org_profiles` — adding one means a migration plus an entry here
 * plus three catalog lines.
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
export const BUSINESS_TYPE_ICONS: Record<BusinessType, LucideIcon> = {
  telegram: Send,
  edtech: GraduationCap,
  saas: Boxes,
  fitness: Dumbbell,
  media: Radio,
  services: Briefcase,
  other: MoreHorizontal,
};

export const BUSINESS_TYPE_KEYS = Object.keys(BUSINESS_TYPE_ICONS) as BusinessType[];

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
    identityType: "TIN" | "PINFL";
    /**
     * Stays Cyrillic in every UI language. ИНН and ПИНФЛ are what the
     * merchant's own paperwork says, and transliterating them into Latin for
     * the Uzbek UI would leave someone hunting for a label that appears
     * nowhere on the document they are copying from.
     */
    identityLabel: string;
    identityDigits: number;
  }
> = {
  legal_entity: { identityType: "TIN", identityLabel: "ИНН", identityDigits: 9 },
  individual_entrepreneur: { identityType: "TIN", identityLabel: "ИНН", identityDigits: 9 },
  self_employed: { identityType: "PINFL", identityLabel: "ПИНФЛ", identityDigits: 14 },
};

export const LEGAL_FORM_KEYS = Object.keys(LEGAL_FORMS) as LegalForm[];

export type BillingModel = "subscriptions" | "one_off" | "both";
export const BILLING_MODEL_KEYS: BillingModel[] = ["subscriptions", "one_off", "both"];

export type ProviderStatus = "atmos" | "uzum" | "both" | "none";

/**
 * The most load-bearing answer in the wizard. It decides where onboarding ENDS:
 * a merchant who already has an acquirer finishes by pasting keys and can take
 * money today; one who doesn't needs to be told how to apply, not dropped onto
 * a Providers page they physically cannot use.
 */
export const PROVIDER_STATUS_KEYS: ProviderStatus[] = ["atmos", "uzum", "both", "none"];

/** Digits only — merchants paste these with spaces and dashes. */
export function normalizeTaxIdentity(value: string): string {
  return value.replace(/\D/g, "");
}

/**
 * Validation returns a *reason plus the numbers*, never a sentence.
 *
 * The same rule runs on the client (for an instant inline message) and on the
 * server (as the actual guard), and the two render in different places — one in
 * the merchant's chosen UI language, one into a JSON error. Returning English
 * prose from here would force the server to ship a message it cannot translate
 * and the client to display one it did not choose the language of.
 */
export type TaxIdentityResult =
  | { ok: true }
  | { ok: false; reason: "required" | "length"; label: string; expected: number; actual: number };

export function validateTaxIdentity(value: string, legalForm: LegalForm): TaxIdentityResult {
  const digits = normalizeTaxIdentity(value);
  const { identityLabel, identityDigits } = LEGAL_FORMS[legalForm];

  if (digits.length === 0) {
    return {
      ok: false,
      reason: "required",
      label: identityLabel,
      expected: identityDigits,
      actual: 0,
    };
  }
  if (digits.length !== identityDigits) {
    return {
      ok: false,
      reason: "length",
      label: identityLabel,
      expected: identityDigits,
      actual: digits.length,
    };
  }
  return { ok: true };
}
