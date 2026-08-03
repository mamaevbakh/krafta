import { NextResponse } from "next/server";
import { createAdminSupabase } from "@/lib/supabase-admin";
import { authenticateMerchantApiKey } from "@/lib/api-keys";

/**
 * Shared plumbing for the public merchant API (`/api/v1/*`).
 *
 * Every v1 route authenticates the same way, reports errors the same way, and
 * scopes every query by the key's org and environment. Centralising it here is
 * not just DRY — it is the tenancy boundary. A route that forgets `.eq("org_id",
 * auth.merchantOrgId)` leaks another merchant's billing data, so the fewer
 * places that decision is made, the better.
 */

export type V1Auth = {
  keyId: string;
  merchantOrgId: string;
  environment: "test" | "live";
  name: string;
};

const AUTH_ERRORS = new Set([
  "missing_api_key",
  "invalid_api_key",
  "invalid_api_key_format",
  "invalid_api_key_environment",
]);

export class V1Error extends Error {
  status: number;
  code: string;

  constructor(code: string, status: number, message?: string) {
    super(message ?? code);
    this.code = code;
    this.status = status;
  }
}

export async function authenticateV1(req: Request) {
  const supabase = createAdminSupabase();
  const auth = await authenticateMerchantApiKey({
    supabase,
    authorizationHeader: req.headers.get("authorization"),
  });
  return { supabase, auth: auth as V1Auth };
}

/**
 * Turn any thrown value into the documented error envelope.
 *
 * Errors merchants can act on (bad input, missing object, wrong state) keep
 * their code and a 4xx. Anything else becomes an opaque 500 — an internal
 * Postgres message is not something we want on a customer's terminal.
 */
export function v1ErrorResponse(error: unknown) {
  if (error instanceof V1Error) {
    return NextResponse.json(
      { error: { type: errorTypeForStatus(error.status), code: error.code, message: error.message } },
      { status: error.status },
    );
  }

  const message = error instanceof Error ? error.message : String(error);

  if (AUTH_ERRORS.has(message)) {
    return NextResponse.json(
      {
        error: {
          type: "authentication_error",
          code: message,
          message: v1AuthMessage(message),
        },
      },
      { status: 401 },
    );
  }

  console.error("v1 request failed", { message, error });
  return NextResponse.json(
    {
      error: {
        type: "api_error",
        code: "internal_error",
        message: "Something went wrong on our side. The request was not completed.",
      },
    },
    { status: 500 },
  );
}

function errorTypeForStatus(status: number) {
  if (status === 401) return "authentication_error";
  if (status === 404) return "not_found_error";
  if (status === 409) return "invalid_state_error";
  return "invalid_request_error";
}

function v1AuthMessage(code: string) {
  switch (code) {
    case "missing_api_key":
      return "No API key provided. Send it as `Authorization: Bearer krp_live_...`.";
    case "invalid_api_key_format":
      return "API keys start with `krp_test_` or `krp_live_`.";
    default:
      return "The API key provided is invalid or has been revoked.";
  }
}

export function requireString(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new V1Error("parameter_missing", 400, `\`${field}\` is required.`);
  }
  return value.trim();
}

export function optionalString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/** Clamp a `limit` query param into a sane page size. */
export function parseLimit(value: string | null, fallback = 25, max = 100): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(Math.max(Math.trunc(parsed), 1), max);
}

export async function readJsonBody(req: Request): Promise<Record<string, unknown>> {
  try {
    const body = await req.json();
    if (!body || typeof body !== "object") return {};
    return body as Record<string, unknown>;
  } catch {
    throw new V1Error("invalid_json", 400, "Request body must be valid JSON.");
  }
}
