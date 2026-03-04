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
  const serviceRoleKey = process.env.KRAFTA_SUPABASE_SERVICE_ROLE_KEY;

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
