const encoder = new TextEncoder();
const decoder = new TextDecoder();

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64UrlDecode(value: string): Uint8Array {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(normalized.length + ((4 - (normalized.length % 4)) % 4), "=");
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

export type SignedStatePayload = {
  clientId: string;
  next: string;
  nonce: string;
  iat: number;
};

async function importHmacKey(secret: string) {
  return crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

export async function signState(
  payload: SignedStatePayload,
  secret: string,
): Promise<string> {
  const payloadBytes = encoder.encode(JSON.stringify(payload));
  const payloadEncoded = base64UrlEncode(payloadBytes);
  const key = await importHmacKey(secret);
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(payloadEncoded));
  const signatureEncoded = base64UrlEncode(new Uint8Array(signature));
  return `${payloadEncoded}.${signatureEncoded}`;
}

export async function verifyState(
  token: string,
  secret: string,
): Promise<SignedStatePayload | null> {
  const [payloadEncoded, signatureEncoded] = token.split(".");
  if (!payloadEncoded || !signatureEncoded) {
    return null;
  }

  const key = await importHmacKey(secret);
  const signatureBytes = base64UrlDecode(signatureEncoded);
  const isValid = await crypto.subtle.verify(
    "HMAC",
    key,
    signatureBytes as unknown as BufferSource,
    encoder.encode(payloadEncoded),
  );

  if (!isValid) {
    return null;
  }

  try {
    const payloadJson = decoder.decode(base64UrlDecode(payloadEncoded));
    const payload = JSON.parse(payloadJson) as SignedStatePayload;
    if (
      typeof payload.clientId !== "string" ||
      typeof payload.next !== "string" ||
      typeof payload.nonce !== "string" ||
      typeof payload.iat !== "number"
    ) {
      return null;
    }
    return payload;
  } catch {
    return null;
  }
}
