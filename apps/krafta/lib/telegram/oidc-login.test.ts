import { describe, expect, it } from "vitest";
import {
  SignJWT,
  createLocalJWKSet,
  exportJWK,
  generateKeyPair,
  type JWK,
} from "jose";

import { validateTelegramIdToken } from "./oidc-login";

// Telegram's real id_token is signed by their private key + verified against
// their published JWKS. We can't sign as Telegram, so the test stands up its
// OWN keypair, exposes the public half as a local JWKS, and injects it via the
// `keys` test seam — the verification logic (issuer, audience, exp, nonce,
// signature) is identical to production.

const ISSUER = "https://oauth.telegram.org";
const CLIENT_ID = "7777777:LoginClientId";

async function freshKeys() {
  const { publicKey, privateKey } = await generateKeyPair("RS256", {
    extractable: true,
  });
  const jwk = (await exportJWK(publicKey)) as JWK;
  jwk.kid = "test-key";
  jwk.alg = "RS256";
  jwk.use = "sig";
  return { privateKey, jwks: createLocalJWKSet({ keys: [jwk] }) };
}

function token(privateKey: CryptoKey, claims: Record<string, unknown>) {
  return new SignJWT(claims)
    .setProtectedHeader({ alg: "RS256", kid: "test-key" })
    .setIssuer(ISSUER)
    .setAudience(CLIENT_ID)
    .setIssuedAt()
    .setExpirationTime("5m")
    .sign(privateKey);
}

describe("validateTelegramIdToken", () => {
  it("accepts a well-formed id_token and maps OIDC claims to the payload", async () => {
    const { privateKey, jwks } = await freshKeys();
    const idToken = await token(privateKey, {
      sub: "424242",
      name: "Bakhtiyor",
      preferred_username: "bakh",
      picture: "https://t.me/i/userpic/320/x.jpg",
      nonce: "n-abc",
    });

    const tg = await validateTelegramIdToken(idToken, {
      clientId: CLIENT_ID,
      nonce: "n-abc",
      keys: jwks,
    });

    expect(tg.id).toBe(424242);
    expect(tg.first_name).toBe("Bakhtiyor");
    expect(tg.username).toBe("bakh");
    expect(tg.photo_url).toContain("t.me");
    expect(typeof tg.auth_date).toBe("number");
  });

  it("rejects a token for a different Client ID (aud mismatch)", async () => {
    const { privateKey, jwks } = await freshKeys();
    const idToken = await token(privateKey, { sub: "1", name: "X" });
    await expect(
      validateTelegramIdToken(idToken, { clientId: "someone-else", keys: jwks }),
    ).rejects.toThrow();
  });

  it("rejects a nonce mismatch (replay guard)", async () => {
    const { privateKey, jwks } = await freshKeys();
    const idToken = await token(privateKey, { sub: "1", name: "X", nonce: "n1" });
    await expect(
      validateTelegramIdToken(idToken, { clientId: CLIENT_ID, nonce: "n2", keys: jwks }),
    ).rejects.toThrow();
  });

  it("rejects a token signed by an unknown key", async () => {
    const { privateKey } = await freshKeys();
    const { jwks: strangerJwks } = await freshKeys();
    const idToken = await token(privateKey, { sub: "1", name: "X" });
    await expect(
      validateTelegramIdToken(idToken, { clientId: CLIENT_ID, keys: strangerJwks }),
    ).rejects.toThrow();
  });

  it("rejects an expired token", async () => {
    const { privateKey, jwks } = await freshKeys();
    const now = Math.floor(Date.now() / 1000);
    const idToken = await new SignJWT({ sub: "1", name: "X" })
      .setProtectedHeader({ alg: "RS256", kid: "test-key" })
      .setIssuer(ISSUER)
      .setAudience(CLIENT_ID)
      .setIssuedAt(now - 3600)
      .setExpirationTime(now - 1800)
      .sign(privateKey);
    await expect(
      validateTelegramIdToken(idToken, { clientId: CLIENT_ID, keys: jwks }),
    ).rejects.toThrow();
  });

  it("rejects a wrong issuer", async () => {
    const { privateKey, jwks } = await freshKeys();
    const idToken = await new SignJWT({ sub: "1", name: "X" })
      .setProtectedHeader({ alg: "RS256", kid: "test-key" })
      .setIssuer("https://evil.example.com")
      .setAudience(CLIENT_ID)
      .setIssuedAt()
      .setExpirationTime("5m")
      .sign(privateKey);
    await expect(
      validateTelegramIdToken(idToken, { clientId: CLIENT_ID, keys: jwks }),
    ).rejects.toThrow();
  });
});
