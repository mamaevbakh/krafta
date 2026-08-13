import crypto from "crypto";

const PORTAL_SESSION_TTL_MS = 5 * 60 * 1000;
const PORTAL_ACTIVE_SESSION_EXTENSION_MS = 30 * 60 * 1000;

/**
 * For a link a human sends, rather than one a backend mints on a click.
 *
 * The five-minute TTL above is correct for the API: a customer presses "manage
 * billing" on the merchant's site, we mint, they land immediately. A link a
 * merchant pastes into Telegram is read whenever the parent next picks up their
 * phone — tonight, tomorrow morning, after work. At five minutes, or even
 * thirty, that link is dead before it is opened, and the merchant looks broken
 * to their own customer.
 *
 * Three days is the compromise. The token is a bearer credential — anyone
 * holding it sees that customer's invoices and can change their card — so this
 * is not "make it long enough to never fail". It is long enough for a message
 * to be read at human pace, and short enough that a link forwarded into a
 * family group chat stops working within the week.
 */
const PORTAL_SHARED_LINK_TTL_MS = 3 * 24 * 60 * 60 * 1000;

function getPortalSessionSecret() {
  return (
    process.env.KRAFTA_PAY_PORTAL_SESSION_SECRET ??
    process.env.KRAFTA_PAY_INTERNAL_SECRET ??
    process.env.KRAFTA_PAY_API_KEYS_SECRET ??
    ""
  );
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

function getAllowedReturnOrigins() {
  const origins = new Set<string>();
  for (const origin of [
    parseOrigin(process.env.KRAFTA_APP_URL),
    parseOrigin(process.env.NEXT_PUBLIC_KRAFTA_APP_URL),
    ...parseOriginList(process.env.KRAFTA_APP_URLS),
    ...parseOriginList(process.env.NEXT_PUBLIC_KRAFTA_APP_URLS),
    parseOrigin(process.env.PAY_BASE_URL),
  ]) {
    if (origin) origins.add(origin);
  }
  return origins;
}

export function normalizeCustomerPortalReturnUrl(input: string | null | undefined) {
  const fallbackOrigin =
    parseOrigin(process.env.KRAFTA_APP_URL) ??
    parseOrigin(process.env.NEXT_PUBLIC_KRAFTA_APP_URL) ??
    parseOrigin(process.env.PAY_BASE_URL) ??
    "http://localhost:3000";
  const fallback = `${fallbackOrigin}/dashboard`;

  if (!input) return fallback;
  try {
    const url = new URL(input);
    if (!getAllowedReturnOrigins().has(url.origin)) {
      return fallback;
    }
    return url.toString();
  } catch {
    return fallback;
  }
}

export function generateCustomerPortalSessionToken() {
  return crypto.randomBytes(24).toString("base64url");
}

export function hashCustomerPortalSessionToken(rawToken: string) {
  const hash = crypto.createHash("sha256");
  hash.update(getPortalSessionSecret(), "utf8");
  hash.update(":", "utf8");
  hash.update(rawToken, "utf8");
  return hash.digest("hex");
}

export function getCustomerPortalSessionExpiry() {
  return new Date(Date.now() + PORTAL_SESSION_TTL_MS).toISOString();
}

export function getExtendedCustomerPortalSessionExpiry() {
  return new Date(Date.now() + PORTAL_ACTIVE_SESSION_EXTENSION_MS).toISOString();
}

/** Expiry for a link the merchant sends by hand — see PORTAL_SHARED_LINK_TTL_MS. */
export function getSharedCustomerPortalSessionExpiry() {
  return new Date(Date.now() + PORTAL_SHARED_LINK_TTL_MS).toISOString();
}

type CustomerPortalEventInput = {
  portalSessionId: string;
  orgId: string;
  customerId: string;
  eventType: string;
  subscriptionId?: string | null;
  payload?: Record<string, unknown>;
};

export async function writeCustomerPortalEvent(
  supabase: any,
  input: CustomerPortalEventInput,
) {
  try {
    const { error } = await (supabase as any)
      .schema("payments")
      .from("customer_portal_events")
      .insert({
        customer_portal_session_id: input.portalSessionId,
        org_id: input.orgId,
        customer_id: input.customerId,
        subscription_id: input.subscriptionId ?? null,
        event_type: input.eventType,
        payload: input.payload ?? {},
      });
    if (error) {
      const code = String((error as any)?.code ?? "");
      if (code === "42P01") {
        console.warn("customer_portal_events table missing; skipping portal audit event", {
          eventType: input.eventType,
        });
        return;
      }
      throw error;
    }
  } catch (error) {
    console.error("customer portal audit event write failed", {
      eventType: input.eventType,
      error,
    });
  }
}

export async function getCustomerPortalSessionByToken(
  supabase: any,
  rawToken: string,
) {
  const tokenHash = hashCustomerPortalSessionToken(rawToken);
  const { data, error } = await (supabase as any)
    .schema("payments")
    .from("customer_portal_sessions")
    .select("*")
    .eq("token_hash", tokenHash)
    .maybeSingle();
  if (error) throw error;
  return data as Record<string, any> | null;
}

export async function resolveActiveCustomerPortalSession(
  supabase: any,
  rawToken: string,
) {
  const session = await getCustomerPortalSessionByToken(supabase, rawToken);
  if (!session) return { ok: false as const, reason: "not_found" as const };

  const now = new Date();
  const expiresAt = new Date(String(session.expires_at));
  if (Number.isNaN(expiresAt.getTime()) || expiresAt <= now) {
    if (session.status !== "expired") {
      await (supabase as any)
        .schema("payments")
        .from("customer_portal_sessions")
        .update({
          status: "expired",
          updated_at: now.toISOString(),
        })
        .eq("id", session.id);
    }
    return { ok: false as const, reason: "expired" as const };
  }

  if (session.status === "revoked") {
    return { ok: false as const, reason: "revoked" as const };
  }

  if (session.status === "created") {
    const nextUsedAt = session.used_at ?? now.toISOString();
    const nextExpiresAt = getExtendedCustomerPortalSessionExpiry();
    await (supabase as any)
      .schema("payments")
      .from("customer_portal_sessions")
      .update({
        status: "used",
        used_at: nextUsedAt,
        expires_at: nextExpiresAt,
        updated_at: now.toISOString(),
      })
      .eq("id", session.id);
    session.status = "used";
    session.used_at = nextUsedAt;
    session.expires_at = nextExpiresAt;
    session.updated_at = now.toISOString();
    await writeCustomerPortalEvent(supabase, {
      portalSessionId: session.id,
      orgId: session.org_id,
      customerId: session.customer_id,
      eventType: "session_opened",
      payload: {
        firstOpen: true,
      },
    });
  }

  return { ok: true as const, session };
}
