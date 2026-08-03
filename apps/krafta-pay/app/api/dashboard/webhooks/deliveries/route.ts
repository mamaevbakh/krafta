import { NextResponse } from "next/server";
import { createAdminSupabase } from "@/lib/supabase-admin";
import { getAuthenticatedUserOrThrow, requireOrgMembership } from "@/lib/dashboard-auth";

/** Auth/authz failures are 401/403, not 500. See the endpoints route. */
function statusForError(message: string): number {
  if (message === "unauthorized") return 401;
  if (message === "forbidden" || message === "insufficient_role") return 403;
  return 500;
}

/**
 * Recent delivery attempts, for the "why isn't my endpoint working" question.
 *
 * Returns the merchant's own response status and body snippet — nine times out
 * of ten the answer is in their 500, not in ours, and showing it turns a
 * support conversation into a self-serve fix.
 */
export async function GET(req: Request) {
  try {
    const { supabase, user } = await getAuthenticatedUserOrThrow();
    const url = new URL(req.url);
    const orgId = url.searchParams.get("orgId")?.trim();
    if (!orgId) return NextResponse.json({ error: "orgId is required" }, { status: 400 });

    await requireOrgMembership({ supabase, userId: user.id, orgId, minRole: "admin" });

    const endpointId = url.searchParams.get("endpointId")?.trim() || null;
    const statusFilter = url.searchParams.get("status")?.trim() || null;
    const limitParam = Number(url.searchParams.get("limit"));
    const limit = Number.isFinite(limitParam) ? Math.min(Math.max(limitParam, 1), 200) : 50;

    const admin = createAdminSupabase();
    let query = admin
      .schema("payments")
      .from("webhook_deliveries")
      .select(
        "id, endpoint_id, event_id, event_type, status, attempt_count, environment, last_status_code, last_error, last_response_snippet, next_attempt_at, delivered_at, created_at",
      )
      .eq("org_id", orgId)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (endpointId) query = query.eq("endpoint_id", endpointId);
    if (statusFilter) query = query.eq("status", statusFilter);

    const { data, error } = await query;
    if (error) throw error;

    return NextResponse.json({ deliveries: data ?? [] });
  } catch (error) {
    const message = error instanceof Error ? error.message : "deliveries_get_failed";
    return NextResponse.json({ error: message }, { status: statusForError(message) });
  }
}

/**
 * Re-queue a delivery for immediate retry.
 *
 * The operator escape hatch after a merchant fixes their endpoint: without it,
 * an event that exhausted its backoff is lost and the merchant's state stays
 * permanently out of sync with ours.
 */
export async function POST(req: Request) {
  try {
    const { supabase, user } = await getAuthenticatedUserOrThrow();
    const body = (await req.json()) as { orgId?: string; deliveryId?: string };
    const orgId = body.orgId?.trim();
    const deliveryId = body.deliveryId?.trim();
    if (!orgId || !deliveryId) {
      return NextResponse.json({ error: "orgId and deliveryId are required" }, { status: 400 });
    }

    await requireOrgMembership({ supabase, userId: user.id, orgId, minRole: "admin" });

    const admin = createAdminSupabase();
    const { data, error } = await admin
      .schema("payments")
      .from("webhook_deliveries")
      .update({
        status: "pending",
        // Reset the counter so the replay gets the full backoff schedule again
        // rather than one attempt before giving up.
        attempt_count: 0,
        next_attempt_at: new Date().toISOString(),
        last_error: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", deliveryId)
      .eq("org_id", orgId)
      .select("id, status")
      .maybeSingle();
    if (error) throw error;
    if (!data) return NextResponse.json({ error: "delivery_not_found" }, { status: 404 });

    return NextResponse.json({ ok: true, delivery: data });
  } catch (error) {
    const message = error instanceof Error ? error.message : "delivery_retry_failed";
    return NextResponse.json({ error: message }, { status: statusForError(message) });
  }
}
