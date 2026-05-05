import { createHash, timingSafeEqual } from "node:crypto";
import { createClient as createAdminClient } from "@supabase/supabase-js";

export function sha256Hex(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function sha256Base64Url(value: string): string {
  return createHash("sha256")
    .update(value)
    .digest("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

export function secureCompareHex(a: string, b: string): boolean {
  const left = Buffer.from(a, "hex");
  const right = Buffer.from(b, "hex");
  if (left.length !== right.length) {
    return false;
  }
  return timingSafeEqual(left, right);
}

export function secureCompareText(a: string, b: string): boolean {
  const left = Buffer.from(a, "utf8");
  const right = Buffer.from(b, "utf8");
  if (left.length !== right.length) {
    return false;
  }
  return timingSafeEqual(left, right);
}

export function createSsoAdminClient() {
  const supabaseUrl = process.env.KRAFTA_SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.KRAFTA_SUPABASE_SECRET_KEY ?? process.env.KRAFTA_SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SECRET_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("missing_supabase_admin_credentials");
  }

  return createAdminClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

export function normalizeClientNext(
  next: string | null,
  targetOrigin: string,
  fallbackPath = "/dashboard",
): string {
  if (!next) {
    return `${targetOrigin}${fallbackPath}`;
  }

  if (next.startsWith("/") && !next.startsWith("//")) {
    return `${targetOrigin}${next}`;
  }

  try {
    const target = new URL(next);
    if (target.origin === targetOrigin) {
      return target.toString();
    }
  } catch {
    return `${targetOrigin}${fallbackPath}`;
  }

  return `${targetOrigin}${fallbackPath}`;
}

function parseOrigin(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}

function parseOriginList(value: string | null | undefined): string[] {
  if (!value) return [];
  return value
    .split(",")
    .map((entry) => parseOrigin(entry.trim()))
    .filter((entry): entry is string => Boolean(entry));
}

function buildCallbackUris(origins: string[]) {
  return origins.map((origin) => `${origin}/auth/sso/callback`);
}

export function getClientCallbackAllowlist(clientId: string, dbRedirectUris: string[]) {
  const appOrigins = [
    parseOrigin(process.env.KRAFTA_APP_URL),
    parseOrigin(process.env.NEXT_PUBLIC_KRAFTA_APP_URL),
    ...parseOriginList(process.env.KRAFTA_APP_URLS),
    ...parseOriginList(process.env.NEXT_PUBLIC_KRAFTA_APP_URLS),
  ].filter((entry): entry is string => Boolean(entry));

  const payOrigins = [
    parseOrigin(process.env.KRAFTA_PAY_URL),
    parseOrigin(process.env.NEXT_PUBLIC_KRAFTA_PAY_URL),
    ...parseOriginList(process.env.KRAFTA_PAY_URLS),
    ...parseOriginList(process.env.NEXT_PUBLIC_KRAFTA_PAY_URLS),
  ].filter((entry): entry is string => Boolean(entry));

  const dynamicUris =
    clientId === "krafta-web"
      ? buildCallbackUris(appOrigins)
      : clientId === "krafta-pay-web"
        ? buildCallbackUris(payOrigins)
        : [];

  return [...new Set([...dbRedirectUris, ...dynamicUris])];
}
