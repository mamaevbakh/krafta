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

export async function GET(req: Request) {
  try {
    const { supabase, user } = await getAuthenticatedUserOrThrow();
    const url = new URL(req.url);
    const orgId = parseOrgId(url.searchParams.get("orgId"));

    await requireOrgMembership({
      supabase,
      userId: user.id,
      orgId,
      minRole: "member",
    });

    const admin = createAdminSupabase();
    const { data, error } = await admin
      .schema("payments")
      .from("subscriptions")
      .select(
        "id, status, cancel_at_period_end, canceled_at, current_period_start, current_period_end, created_at, updated_at, plan_id, customer_id, default_payment_method_id, plans:plan_id(id, name, code, amount_minor, currency), customers:customer_id(email, phone)",
      )
      .eq("org_id", orgId)
      .order("created_at", { ascending: false });
    if (error) throw error;

    return NextResponse.json({ subscriptions: data ?? [] });
  } catch (error) {
    const message = error instanceof Error ? error.message : "subscriptions_get_failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
