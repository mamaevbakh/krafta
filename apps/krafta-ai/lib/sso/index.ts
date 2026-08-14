/**
 * Vendored from `@krafta/auth-sso` in the Krafta monorepo.
 *
 * Krafta AI is a separate repository and cannot import a workspace package.
 * These three files are dependency-free and small, so copying beats standing
 * up a publishing pipeline — but that makes them a FORK, and forks drift.
 *
 * If the identity provider's state or PKCE format ever changes, this copy has
 * to change with it or sign-in breaks with a signature mismatch that looks
 * like a config problem. Grep for `auth-sso` in both repos before touching
 * either side.
 */

export { buildAuthorizeUrl, type BuildAuthorizeUrlParams } from "./oauth"
export { createCodeChallenge, createCodeVerifier } from "./pkce"
export { signState, verifyState, type SignedStatePayload } from "./state"
