/**
 * Krafta AI as an OIDC relying party on auth.krafta.org.
 *
 * One identity across Krafta, Krafta Pay and Krafta AI. A merchant who already
 * has a Krafta account must never be asked to create a second one — Krafta AI
 * is an upsell to that installed base, and a separate signup throws away the
 * only distribution advantage there is. It is also why the org switcher works
 * at all: the shared Supabase user pool is what makes `organization_members`
 * resolve for the same person in both products.
 *
 * SSO is PROD-ONLY, same as its siblings. `public.auth_clients` is empty on the
 * dev branch, so `hasSsoRuntimeConfig()` is false there and the console falls
 * back to the email + password form from A1. That fallback is not a workaround
 * for broken SSO — it is the house pattern, and it keeps a laptop from needing
 * the production identity provider to run.
 */

export const SSO_CODE_VERIFIER_COOKIE = "kai_sso_code_verifier"
export const SSO_STATE_COOKIE = "kai_sso_state"
/**
 * Scoped to the callback path so the verifier is not attached to every
 * request in the app — it is a one-shot secret and belongs on one route.
 */
export const SSO_COOKIE_PATH = "/auth/sso"

/** How long an in-flight sign-in may take before its state is rejected. */
export const SSO_STATE_TTL_MS = 10 * 60 * 1000

export function getSsoClientId() {
  return process.env.KRAFTA_AI_SSO_CLIENT_ID ?? "krafta-ai-web"
}

export function getSsoClientSecret() {
  return process.env.KRAFTA_AI_SSO_CLIENT_SECRET ?? ""
}

/**
 * Shared with the other relying parties. The identity provider does not read
 * it — it only signs the `state` this app later verifies, which is what stops
 * a third party from forging a callback that looks like ours.
 */
export function getSsoStateSecret() {
  return process.env.KRAFTA_SSO_STATE_SECRET ?? ""
}

export function getSsoAuthBaseUrl() {
  return (
    process.env.KRAFTA_AUTH_URL ??
    process.env.NEXT_PUBLIC_KRAFTA_AUTH_URL ??
    ""
  )
}

/**
 * Whether this deployment can do SSO at all.
 *
 * All four or none: a half-configured relying party would send merchants to an
 * identity provider that refuses them, which is worse than showing the form.
 */
export function hasSsoRuntimeConfig() {
  return Boolean(
    getSsoAuthBaseUrl() &&
      getSsoClientId() &&
      getSsoClientSecret() &&
      getSsoStateSecret()
  )
}

/**
 * Narrows a `next` to a path on THIS origin.
 *
 * `next` survives a round trip through the identity provider and comes back on
 * a URL the visitor can edit, so an absolute value would make the callback an
 * open redirect — sign in with Krafta, land on someone else's site, still
 * trusting the address that sent you.
 */
export function normalizeNext(
  next: string | null | undefined,
  origin: string,
  fallback: string
): string {
  if (!next) return fallback
  if (next.startsWith("/") && !next.startsWith("//")) return next
  try {
    const target = new URL(next)
    if (target.origin === origin) return `${target.pathname}${target.search}`
  } catch {
    return fallback
  }
  return fallback
}

/** The origin the visitor actually reached, behind Vercel's proxy. */
export function getRequestOrigin(headers: Headers, fallback: string): string {
  const host = headers.get("x-forwarded-host") ?? headers.get("host")
  if (!host) return fallback
  const proto = headers.get("x-forwarded-proto") ?? "https"
  return `${proto}://${host}`
}
