import crypto from "crypto";

const MAX_SKEW_MS = 5 * 60 * 1000;

function getInternalSecret() {
  return process.env.KRAFTA_PAY_INTERNAL_SECRET ?? process.env.BILLING_INTERNAL_SECRET ?? null;
}

export function signInternalPayload(payload: string, timestamp: string, secret: string) {
  return crypto
    .createHmac("sha256", secret)
    .update(`${timestamp}.${payload}`, "utf8")
    .digest("hex");
}

function parseSignatureHeader(raw: string | null) {
  if (!raw) return null;
  const value = raw.trim();
  if (!value) return null;
  if (value.startsWith("sha256=")) return value.slice("sha256=".length);
  return value;
}

export function verifyInternalRequest(params: {
  rawBody: string;
  timestampHeader: string | null;
  signatureHeader: string | null;
}) {
  const secret = getInternalSecret();
  if (!secret) {
    throw new Error("missing_internal_secret");
  }

  const timestamp = params.timestampHeader;
  if (!timestamp) {
    throw new Error("missing_signature_timestamp");
  }

  const tsNumber = Number(timestamp);
  if (!Number.isFinite(tsNumber)) {
    throw new Error("invalid_signature_timestamp");
  }

  if (Math.abs(Date.now() - tsNumber) > MAX_SKEW_MS) {
    throw new Error("signature_timestamp_out_of_range");
  }

  const provided = parseSignatureHeader(params.signatureHeader);
  if (!provided) {
    throw new Error("missing_signature");
  }

  const expected = signInternalPayload(params.rawBody, timestamp, secret);
  const expectedBuf = Buffer.from(expected, "utf8");
  const providedBuf = Buffer.from(provided.toLowerCase(), "utf8");
  if (expectedBuf.length !== providedBuf.length) {
    throw new Error("invalid_signature");
  }
  if (!crypto.timingSafeEqual(expectedBuf, providedBuf)) {
    throw new Error("invalid_signature");
  }
}
