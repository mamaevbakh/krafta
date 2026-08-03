import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Creating a Krafta Pay merchant account.
 *
 * Krafta Pay had no way to make one. `payments.*` is scoped by `org_id` into
 * `public.organizations`, and the only code that ever inserted an organization
 * was Krafta Catalogs' shop wizard — which also creates a catalog, a venue, a
 * currency, and a storefront. So signing up for the billing product meant
 * creating a restaurant menu first, and `/signup` just redirected into the
 * Krafta app.
 *
 * This creates the organization on its own: no catalog, no venue, no storefront.
 * Deliberately no INN / KYB fields either — the merchant brings their own
 * acquirer credentials, so Atmos or Uzum has already run KYB on them, and we
 * are not the merchant of record and never touch their funds. The tax identity
 * that fiscalization genuinely needs is collected later, on the plan, where it
 * is actually used.
 */

const SLUG_MAX_LENGTH = 40;
const RESERVED_SLUGS = new Set([
  "api",
  "app",
  "auth",
  "dashboard",
  "login",
  "signup",
  "pay",
  "portal",
  "admin",
  "krafta",
  "www",
  "internal",
  "webhooks",
]);

export function slugifyOrgName(name: string): string {
  const base = name
    .toLowerCase()
    .normalize("NFKD")
    // Cyrillic is the common case here, and stripping it would leave an empty
    // slug for a merchant who typed their name in Russian or Uzbek.
    .replace(/[Ѐ-ӿ]/g, (char) => CYRILLIC_TRANSLITERATION[char] ?? "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, SLUG_MAX_LENGTH)
    .replace(/-+$/g, "");

  return base || "merchant";
}

const CYRILLIC_TRANSLITERATION: Record<string, string> = {
  а: "a", б: "b", в: "v", г: "g", д: "d", е: "e", ё: "e", ж: "zh", з: "z",
  и: "i", й: "y", к: "k", л: "l", м: "m", н: "n", о: "o", п: "p", р: "r",
  с: "s", т: "t", у: "u", ф: "f", х: "h", ц: "ts", ч: "ch", ш: "sh",
  щ: "sch", ъ: "", ы: "y", ь: "", э: "e", ю: "yu", я: "ya",
  ў: "o", қ: "q", ғ: "g", ҳ: "h",
};

async function findAvailableSlug(admin: SupabaseClient, desired: string): Promise<string> {
  const base = RESERVED_SLUGS.has(desired) ? `${desired}-pay` : desired;

  for (let suffix = 0; suffix < 50; suffix += 1) {
    const candidate = suffix === 0 ? base : `${base}-${suffix + 1}`;
    const { data, error } = await admin
      .from("organizations")
      .select("id")
      .eq("slug", candidate)
      .maybeSingle();
    if (error) throw error;
    if (!data) return candidate;
  }

  // 50 collisions on one name is implausible enough that a random tail is a
  // better answer than failing the signup.
  return `${base}-${Math.random().toString(36).slice(2, 8)}`;
}

export type CreateMerchantAccountResult = {
  orgId: string;
  orgName: string;
  orgSlug: string;
  created: boolean;
};

/**
 * Create an organization and make `userId` its owner.
 *
 * `admin` MUST be a service-role client: `organizations` has no INSERT policy
 * for `authenticated` (in Krafta they are only ever created inside a
 * SECURITY DEFINER wizard RPC), and the membership row that would authorize the
 * insert does not exist yet — the classic bootstrap cycle. Callers are
 * responsible for having authenticated the user first.
 */
export async function createMerchantAccount(
  admin: SupabaseClient,
  input: { userId: string; name: string; countryIso2?: string | null },
): Promise<CreateMerchantAccountResult> {
  const name = input.name.trim();
  if (!name) throw new Error("name_required");
  if (name.length > 120) throw new Error("name_too_long");

  const slug = await findAvailableSlug(admin, slugifyOrgName(name));

  const { data: org, error: orgErr } = await admin
    .from("organizations")
    .insert({
      name,
      slug,
      country_iso2: input.countryIso2 ?? "UZ",
    })
    .select("id, name, slug")
    .single();
  if (orgErr) throw orgErr;

  const { error: memberErr } = await admin
    .from("organization_members")
    .insert({ org_id: org.id, user_id: input.userId, role: "owner" });

  if (memberErr) {
    // Without the membership the org is invisible and unreachable — worse than
    // no org at all, because the slug is now taken and a retry gets a different
    // one. Roll it back so the merchant can simply try again.
    await admin.from("organizations").delete().eq("id", org.id);
    throw memberErr;
  }

  return { orgId: org.id, orgName: org.name, orgSlug: org.slug, created: true };
}

/** Does this user already belong to any organization? */
export async function userHasAnyOrg(
  admin: SupabaseClient,
  userId: string,
): Promise<boolean> {
  const { data, error } = await admin
    .from("organization_members")
    .select("id")
    .eq("user_id", userId)
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return Boolean(data);
}
