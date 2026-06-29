import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";

import { getCommerceAdminClient } from "./client";
import {
  authenticateCommerceApiKey,
  CommerceAuthError,
  type CommerceKeyContext,
  type CommerceKeyType,
} from "./api-keys";

// Shared handler envelope for the public commerce API (/api/commerce/v1/*).
// Authenticates the bearer key, derives org + catalog from it (never the body),
// adds permissive CORS (publishable keys are browser-safe + read-only +
// catalog-scoped), and keeps error responses generic — never leaking internals.

const CORS_HEADERS: Record<string, string> = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET,POST,OPTIONS",
  "access-control-allow-headers": "authorization,content-type",
  "access-control-max-age": "86400",
};

export function commerceJson(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...CORS_HEADERS },
  });
}

export function corsPreflight(): Response {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

type CommerceCtx = {
  key: CommerceKeyContext;
  admin: SupabaseClient<Database>;
  params?: Promise<Record<string, string>>;
};

type CommerceHandler = (ctx: CommerceCtx, request: Request) => Promise<Response>;

export function withCommerceKey(
  handler: CommerceHandler,
  opts?: { required?: CommerceKeyType },
) {
  return async (
    request: Request,
    context?: { params?: Promise<Record<string, string>> },
  ): Promise<Response> => {
    const admin = getCommerceAdminClient();
    if (!admin) return commerceJson({ error: "not_configured" }, 500);

    let key: CommerceKeyContext;
    try {
      key = await authenticateCommerceApiKey({
        supabase: admin,
        authorizationHeader: request.headers.get("authorization"),
        required: opts?.required,
      });
    } catch (error) {
      const code = error instanceof CommerceAuthError ? error.code : "unauthorized";
      return commerceJson({ error: code }, 401);
    }

    try {
      return await handler({ key, admin, params: context?.params }, request);
    } catch {
      return commerceJson({ error: "server_error" }, 500);
    }
  };
}
