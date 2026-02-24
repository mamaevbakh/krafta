import { NextResponse } from "next/server";
import { createAdminSupabase } from "@/lib/supabase-admin";
import {
  getAuthenticatedUserOrThrow,
  requireOrgMembership,
} from "@/lib/dashboard-auth";

function parseOrgId(value: unknown) {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error("orgId_required");
  }
  return value.trim();
}

function parseLimit(value: unknown) {
  const n = Number(value ?? 100);
  if (!Number.isFinite(n)) return 100;
  return Math.min(Math.max(Math.trunc(n), 1), 500);
}

export async function GET(req: Request) {
  try {
    const { supabase, user } = await getAuthenticatedUserOrThrow();
    const url = new URL(req.url);
    const orgId = parseOrgId(url.searchParams.get("orgId"));
    const publicToken = url.searchParams.get("publicToken")?.trim() || null;
    const type = url.searchParams.get("type")?.trim() || null;
    const providerId = url.searchParams.get("providerId")?.trim() || null;
    const limit = parseLimit(url.searchParams.get("limit"));

    await requireOrgMembership({
      supabase,
      userId: user.id,
      orgId,
      minRole: "member",
    });

    const admin = createAdminSupabase();
    const adminAny = admin as any;

    const { data: sessions, error: sessionsErr } = await adminAny
      .schema("payments")
      .from("checkout_sessions")
      .select("id, public_token, payment_intent_id, created_at")
      .eq("org_id", orgId)
      .order("created_at", { ascending: false })
      .limit(200);
    if (sessionsErr) throw sessionsErr;

    const sessionRows = (sessions ?? []) as Array<{
      id: string;
      public_token: string;
      payment_intent_id: string | null;
      created_at: string;
    }>;
    const tokenSet = new Set(
      sessionRows
        .map((row) => row.public_token)
        .filter((row): row is string => typeof row === "string" && row.length > 0),
    );
    const requestedTokenBelongsToOrg =
      !publicToken || tokenSet.has(publicToken);
    if (!requestedTokenBelongsToOrg) {
      throw new Error("forbidden");
    }

    let logsQuery = adminAny
      .schema("payments")
      .from("logs")
      .select(
        "id, created_at, environment, type, event, level, provider_id, org_id, checkout_session_id, payment_intent_id, payment_attempt_id, public_token, data",
      )
      .order("created_at", { ascending: false })
      .limit(limit);

    if (publicToken) {
      logsQuery = logsQuery.eq("public_token", publicToken);
    } else {
      const tokens = Array.from(tokenSet).slice(0, 100);
      if (tokens.length === 0) {
        return NextResponse.json({ logs: [], recentCheckouts: sessionRows.slice(0, 20) });
      }
      logsQuery = logsQuery.in("public_token", tokens);
    }

    if (type) logsQuery = logsQuery.eq("type", type);
    if (providerId) logsQuery = logsQuery.eq("provider_id", providerId);

    const { data: logs, error: logsErr } = await logsQuery;
    if (logsErr) throw logsErr;

    return NextResponse.json({
      logs: logs ?? [],
      recentCheckouts: sessionRows.slice(0, 20),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "logs_get_failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
