import "server-only";

import crypto from "node:crypto";

/**
 * secret-box.ts — app-layer AES-256-GCM for secrets at rest.
 *
 * Wire-compatible with packages/payments-core/src/secrets.ts (same
 * {v, alg, iv, tag, data} envelope, same key derivation), so a value
 * encrypted by either side decrypts on the other. Duplicated here on
 * purpose: the customer-facing commerce app must not take a dependency
 * on the payments package just to store a Telegram bot token.
 *
 * Key resolution prefers a notifications-specific secret but falls back
 * to the payments credentials secret so a single key can cover both in
 * deployments that share one. When NO key is set the value is stored as
 * plaintext (matching the payments-core graceful-degradation behavior) —
 * a warning is logged because a bot token is sensitive. Set
 * KRAFTA_NOTIFICATIONS_SECRET (or PAY_CREDENTIALS_SECRET) in any real
 * deployment.
 */

export type EncryptedEnvelope = {
  v: 1;
  alg: "aes-256-gcm";
  iv: string;
  tag: string;
  data: string;
};

function deriveKey(secret: string): Buffer {
  return crypto.createHash("sha256").update(secret, "utf8").digest();
}

export function resolveSecretKey(
  env: NodeJS.ProcessEnv = process.env,
): string | null {
  return (
    env.KRAFTA_NOTIFICATIONS_SECRET ??
    env.PAY_CREDENTIALS_SECRET ??
    env.KRAFTA_PAY_CREDENTIALS_SECRET ??
    null
  );
}

export function isEncryptedEnvelope(value: unknown): value is EncryptedEnvelope {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return (
    v.v === 1 &&
    v.alg === "aes-256-gcm" &&
    typeof v.iv === "string" &&
    typeof v.tag === "string" &&
    typeof v.data === "string"
  );
}

export function encryptSecret(plaintext: string, secret: string): EncryptedEnvelope {
  const key = deriveKey(secret);
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([
    cipher.update(Buffer.from(plaintext, "utf8")),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return {
    v: 1,
    alg: "aes-256-gcm",
    iv: iv.toString("base64"),
    tag: tag.toString("base64"),
    data: encrypted.toString("base64"),
  };
}

export function decryptSecret(envelope: EncryptedEnvelope, secret: string): string {
  const key = deriveKey(secret);
  const iv = Buffer.from(envelope.iv, "base64");
  const tag = Buffer.from(envelope.tag, "base64");
  const data = Buffer.from(envelope.data, "base64");
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8");
}

/**
 * Encrypt a secret string into a jsonb-storable value. When no key is
 * configured, returns the plaintext (logged) so dev without the env set
 * still works — never store production secrets without the key.
 */
export function sealSecret(
  plaintext: string,
  env: NodeJS.ProcessEnv = process.env,
): EncryptedEnvelope | string {
  const key = resolveSecretKey(env);
  if (!key) {
    console.warn(
      "[secret-box] no encryption key (KRAFTA_NOTIFICATIONS_SECRET / PAY_CREDENTIALS_SECRET) — storing secret as PLAINTEXT",
    );
    return plaintext;
  }
  return encryptSecret(plaintext, key);
}

/**
 * Reverse of sealSecret. Accepts either an envelope (decrypts) or a raw
 * string (returns as-is, e.g. plaintext stored when no key was set).
 * Returns null when the value can't be resolved to a secret.
 */
export function openSecret(
  stored: unknown,
  env: NodeJS.ProcessEnv = process.env,
): string | null {
  if (typeof stored === "string") return stored; // plaintext fallback
  if (!isEncryptedEnvelope(stored)) return null;
  const key = resolveSecretKey(env);
  if (!key) {
    console.warn("[secret-box] encrypted value present but no key to decrypt it");
    return null;
  }
  try {
    return decryptSecret(stored, key);
  } catch {
    return null;
  }
}
