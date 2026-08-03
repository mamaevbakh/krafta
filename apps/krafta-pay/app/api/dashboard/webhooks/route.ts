import { NextResponse } from "next/server";
import {
  WEBHOOK_EVENT_TYPES,
  decryptWebhookSecret,
  encryptWebhookSecret,
  generateWebhookSecret,
  requireWebhookSecretKey,
} from "@krafta/payments-core";
import { createAdminSupabase } from "@/lib/supabase-admin";
import { getAuthenticatedUserOrThrow, requireOrgMembership } from "@/lib/dashboard-auth";

/**
 * Dashboard CRUD for outbound webhook endpoints.
 *
 * Session-authed (not API-key authed) and admin-only: registering an endpoint
 * decides where a merchant's billing events get sent, which is exactly the
 * lever an attacker with a stolen member session would pull to exfiltrate
 * customer emails and subscription state.
 */

type WebhookBody = {
  orgId?: string;
  endpointId?: string;
  url?: string;
  description?: string;
  environment?: "test" | "live";
  enabledEvents?: string[] | null;
  status?: "enabled" | "disabled";
  /** Reveal the signing secret (a deliberate, separate action). */
  revealSecret?: boolean;
};

function parseOrgId(value: unknown) {
  if (typeof value !== "string" || !value.trim()) throw new Error("orgId_required");
  return value.trim();
}

function parseEnvironment(value: unknown): "test" | "live" {
  return value === "live" ? "live" : "test";
}

/**
 * Map a thrown message to a status. Auth and authz failures must not surface as
 * 500 — a signed-out session hitting this looks like a server fault otherwise,
 * and a client cannot tell "log back in" from "we broke".
 */
function statusForError(message: string): number {
  if (message === "unauthorized") return 401;
  if (message === "forbidden" || message === "insufficient_role") return 403;
  if (message.startsWith("url_") || message.endsWith("_required")) return 400;
  return 500;
}

function parseUrl(value: unknown): string {
  if (typeof value !== "string" || !value.trim()) throw new Error("url_required");
  const trimmed = value.trim();

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new Error("url_invalid");
  }

  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    throw new Error("url_must_be_http");
  }

  // http:// is allowed only for local development. Sending a merchant's
  // customer emails and subscription state over plaintext to a public host is
  // not a mistake we should let someone make from a settings form.
  const isLocal = ["localhost", "127.0.0.1", "::1"].includes(parsed.hostname);
  if (parsed.protocol === "http:" && !isLocal) {
    throw new Error("url_must_be_https");
  }

  return trimmed;
}

function parseEnabledEvents(value: unknown): string[] | null {
  if (value === null || value === undefined) return null;
  if (!Array.isArray(value)) return null;
  const filtered = value.filter(
    (event): event is string =>
      typeof event === "string" && (WEBHOOK_EVENT_TYPES as readonly string[]).includes(event),
  );
  // An empty selection means "all" rather than "none" — an endpoint wired to
  // receive nothing is always a mistake, never an intention.
  return filtered.length > 0 ? filtered : null;
}

export async function GET(req: Request) {
  try {
    const { supabase, user } = await getAuthenticatedUserOrThrow();
    const url = new URL(req.url);
    const orgId = parseOrgId(url.searchParams.get("orgId"));

    await requireOrgMembership({ supabase, userId: user.id, orgId, minRole: "admin" });

    const admin = createAdminSupabase();
    const { data, error } = await admin
      .schema("payments")
      .from("webhook_endpoints")
      .select(
        "id, url, description, environment, enabled_events, status, consecutive_failure_count, created_at, disabled_at",
      )
      .eq("org_id", orgId)
      .order("created_at", { ascending: false });
    if (error) throw error;

    return NextResponse.json({
      endpoints: data ?? [],
      availableEvents: WEBHOOK_EVENT_TYPES,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "webhooks_get_failed";
    return NextResponse.json({ error: message }, { status: statusForError(message) });
  }
}

export async function POST(req: Request) {
  try {
    const { supabase, user } = await getAuthenticatedUserOrThrow();
    const body = (await req.json()) as WebhookBody;
    const orgId = parseOrgId(body.orgId);

    await requireOrgMembership({ supabase, userId: user.id, orgId, minRole: "admin" });

    const secretKey = requireWebhookSecretKey();
    const secret = generateWebhookSecret();
    const admin = createAdminSupabase();

    const { data, error } = await admin
      .schema("payments")
      .from("webhook_endpoints")
      .insert({
        org_id: orgId,
        url: parseUrl(body.url),
        description: typeof body.description === "string" ? body.description.trim() || null : null,
        environment: parseEnvironment(body.environment),
        enabled_events: parseEnabledEvents(body.enabledEvents),
        status: "enabled",
        secret_encrypted: encryptWebhookSecret(secret, secretKey),
        metadata: { created_by_user_id: user.id },
      })
      .select("id, url, description, environment, enabled_events, status, created_at")
      .single();
    if (error) throw error;

    // Returned once at creation, exactly like an API key. It is also
    // retrievable later via `revealSecret` — a merchant who loses it needs a way
    // back that is not "delete and re-register the endpoint".
    return NextResponse.json({ ok: true, endpoint: data, secret }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "webhooks_create_failed";
    return NextResponse.json({ error: message }, { status: statusForError(message) });
  }
}

export async function PATCH(req: Request) {
  try {
    const { supabase, user } = await getAuthenticatedUserOrThrow();
    const body = (await req.json()) as WebhookBody;
    const orgId = parseOrgId(body.orgId);
    if (!body.endpointId) {
      return NextResponse.json({ error: "endpointId is required" }, { status: 400 });
    }

    await requireOrgMembership({ supabase, userId: user.id, orgId, minRole: "admin" });

    const admin = createAdminSupabase();

    if (body.revealSecret) {
      const { data, error } = await admin
        .schema("payments")
        .from("webhook_endpoints")
        .select("secret_encrypted")
        .eq("id", body.endpointId)
        .eq("org_id", orgId)
        .maybeSingle();
      if (error) throw error;
      if (!data) return NextResponse.json({ error: "endpoint_not_found" }, { status: 404 });

      const secret = decryptWebhookSecret(data.secret_encrypted);
      if (!secret) return NextResponse.json({ error: "secret_unreadable" }, { status: 500 });
      return NextResponse.json({ ok: true, secret });
    }

    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (body.url !== undefined) patch.url = parseUrl(body.url);
    if (body.description !== undefined) {
      patch.description =
        typeof body.description === "string" ? body.description.trim() || null : null;
    }
    if (body.enabledEvents !== undefined) {
      patch.enabled_events = parseEnabledEvents(body.enabledEvents);
    }
    if (body.status === "enabled" || body.status === "disabled") {
      patch.status = body.status;
      patch.disabled_at = body.status === "disabled" ? new Date().toISOString() : null;
      // Re-enabling clears the circuit breaker, otherwise an endpoint that was
      // auto-disabled at 20 failures would trip again on the very next failure.
      if (body.status === "enabled") patch.consecutive_failure_count = 0;
    }

    const { data, error } = await admin
      .schema("payments")
      .from("webhook_endpoints")
      .update(patch)
      .eq("id", body.endpointId)
      .eq("org_id", orgId)
      .select(
        "id, url, description, environment, enabled_events, status, consecutive_failure_count, created_at, disabled_at",
      )
      .maybeSingle();
    if (error) throw error;
    if (!data) return NextResponse.json({ error: "endpoint_not_found" }, { status: 404 });

    return NextResponse.json({ ok: true, endpoint: data });
  } catch (error) {
    const message = error instanceof Error ? error.message : "webhooks_update_failed";
    return NextResponse.json({ error: message }, { status: statusForError(message) });
  }
}

export async function DELETE(req: Request) {
  try {
    const { supabase, user } = await getAuthenticatedUserOrThrow();
    const body = (await req.json()) as WebhookBody;
    const orgId = parseOrgId(body.orgId);
    if (!body.endpointId) {
      return NextResponse.json({ error: "endpointId is required" }, { status: 400 });
    }

    await requireOrgMembership({ supabase, userId: user.id, orgId, minRole: "admin" });

    const admin = createAdminSupabase();
    const { error } = await admin
      .schema("payments")
      .from("webhook_endpoints")
      .delete()
      .eq("id", body.endpointId)
      .eq("org_id", orgId);
    if (error) throw error;

    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "webhooks_delete_failed";
    return NextResponse.json({ error: message }, { status: statusForError(message) });
  }
}
