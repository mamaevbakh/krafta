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

const encoder = new TextEncoder();

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

  const base64 = btoa(binary);
  return base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function createCodeVerifier(size = 64): string {
  const bytes = new Uint8Array(size);
  crypto.getRandomValues(bytes);
  return base64UrlEncode(bytes);
}

export async function createCodeChallenge(codeVerifier: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(codeVerifier));
  return base64UrlEncode(new Uint8Array(digest));
}
