import crypto from "crypto";

type EncryptedPayload = {
  v: 1;
  alg: "aes-256-gcm";
  iv: string;
  tag: string;
  data: string;
};

function deriveKey(secret: string): Buffer {
  return crypto.createHash("sha256").update(secret).digest();
}

function isEncryptedPayload(value: unknown): value is EncryptedPayload {
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

export function encryptSecretJson(value: unknown, secret: string): EncryptedPayload {
  const key = deriveKey(secret);
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const plaintext = Buffer.from(JSON.stringify(value), "utf8");
  const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();

  return {
    v: 1,
    alg: "aes-256-gcm",
    iv: iv.toString("base64"),
    tag: tag.toString("base64"),
    data: encrypted.toString("base64"),
  };
}

export function decryptSecretJson(value: unknown, secret: string): unknown {
  if (!isEncryptedPayload(value)) return value;

  const key = deriveKey(secret);
  const iv = Buffer.from(value.iv, "base64");
  const tag = Buffer.from(value.tag, "base64");
  const data = Buffer.from(value.data, "base64");

  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  const plaintext = Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8");
  return JSON.parse(plaintext);
}

export function resolveSecretDecryptionKey(
  env: NodeJS.ProcessEnv,
): string | null {
  return (
    env.PAY_CREDENTIALS_SECRET ??
    env.KRAFTA_PAY_CREDENTIALS_SECRET ??
    null
  );
}

export function decryptSecretJsonMaybe(
  value: unknown,
  env: NodeJS.ProcessEnv = process.env,
): unknown {
  const key = resolveSecretDecryptionKey(env);
  if (!key) return value;

  try {
    return decryptSecretJson(value, key);
  } catch {
    return value;
  }
}
