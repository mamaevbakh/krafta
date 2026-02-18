import crypto from "crypto";

type PayHandoffPayload = {
  accessToken: string;
  refreshToken: string;
  next: string;
  exp: number;
};

function getSharedSecret() {
  return process.env.KRAFTA_PAY_INTERNAL_SECRET ?? process.env.BILLING_INTERNAL_SECRET ?? null;
}

function fromBase64Url(value: string) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
  return Buffer.from(padded, "base64");
}

function deriveKey(secret: string) {
  return crypto.createHash("sha256").update(secret, "utf8").digest();
}

export function decodePayHandoffToken(token: string) {
  const secret = getSharedSecret();
  if (!secret) {
    throw new Error("missing_pay_handoff_secret");
  }

  const [ivPart, cipherPart, tagPart] = token.split(".");
  if (!ivPart || !cipherPart || !tagPart) {
    throw new Error("invalid_pay_handoff_token");
  }

  try {
    const key = deriveKey(secret);
    const iv = fromBase64Url(ivPart);
    const ciphertext = fromBase64Url(cipherPart);
    const authTag = fromBase64Url(tagPart);

    const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(authTag);
    const plaintext = Buffer.concat([
      decipher.update(ciphertext),
      decipher.final(),
    ]).toString("utf8");

    const payload = JSON.parse(plaintext) as PayHandoffPayload;
    if (
      !payload ||
      typeof payload.accessToken !== "string" ||
      typeof payload.refreshToken !== "string" ||
      typeof payload.next !== "string" ||
      typeof payload.exp !== "number"
    ) {
      throw new Error("invalid_pay_handoff_payload");
    }

    if (payload.exp < Date.now()) {
      throw new Error("expired_pay_handoff_token");
    }

    return payload;
  } catch {
    throw new Error("invalid_pay_handoff_token");
  }
}

