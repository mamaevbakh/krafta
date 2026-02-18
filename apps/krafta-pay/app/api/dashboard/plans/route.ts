import { NextResponse } from "next/server";
import { createAdminSupabase } from "@/lib/supabase-admin";
import {
  getAuthenticatedUserOrThrow,
  requireOrgMembership,
} from "@/lib/dashboard-auth";

type PlanBody = {
  orgId: string;
  planId?: string;
  name?: string;
  code?: string;
  amountMinor?: number;
  currency?: string;
  intervalCount?: number;
  trialDays?: number;
  isActive?: boolean;
  spic?: string | null;
};

function parseOrgId(value: unknown) {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error("orgId_required");
  }
  return value.trim();
}

function normalizeSpic(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed;
}

function extractSpic(metadata: unknown): string | null {
  if (!metadata || typeof metadata !== "object") return null;
  const m = metadata as Record<string, unknown>;
  const direct = normalizeSpic(m.spic);
  if (direct) return direct;

  const fiscalization = m.fiscalization;
  if (fiscalization && typeof fiscalization === "object") {
    const nested = fiscalization as Record<string, unknown>;
    const nestedSpic = normalizeSpic(nested.spic);
    if (nestedSpic) return nestedSpic;
  }

  return null;
}

function mergeMetadataWithSpic(base: unknown, spic: string | null) {
  const record =
    base && typeof base === "object" && !Array.isArray(base)
      ? ({ ...(base as Record<string, unknown>) } as Record<string, unknown>)
      : {};

  const fiscalization =
    record.fiscalization &&
    typeof record.fiscalization === "object" &&
    !Array.isArray(record.fiscalization)
      ? ({
          ...(record.fiscalization as Record<string, unknown>),
        } as Record<string, unknown>)
      : {};

  if (spic) {
    fiscalization.spic = spic;
  } else {
    delete fiscalization.spic;
  }

  if (Object.keys(fiscalization).length > 0) {
    record.fiscalization = fiscalization;
  } else {
    delete record.fiscalization;
  }

  return record;
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
      .from("plans")
      .select(
        "id, name, code, amount_minor, currency, interval, interval_count, trial_days, is_active, metadata, created_at, updated_at",
      )
      .eq("org_id", orgId)
      .order("created_at", { ascending: false });
    if (error) throw error;

    const plans = (data ?? []).map((plan) => ({
      id: plan.id,
      name: plan.name,
      code: plan.code,
      amount_minor: plan.amount_minor,
      currency: plan.currency,
      interval_count: plan.interval_count,
      trial_days: plan.trial_days,
      is_active: plan.is_active,
      spic: extractSpic(plan.metadata),
    }));

    return NextResponse.json({ plans });
  } catch (error) {
    const message = error instanceof Error ? error.message : "plans_get_failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const { supabase, user } = await getAuthenticatedUserOrThrow();
    const body = (await req.json()) as PlanBody;
    const orgId = parseOrgId(body.orgId);

    await requireOrgMembership({
      supabase,
      userId: user.id,
      orgId,
      minRole: "admin",
    });

    if (!body.name || !body.code) {
      return NextResponse.json({ error: "name and code are required" }, { status: 400 });
    }

    const spic = normalizeSpic(body.spic);

    const admin = createAdminSupabase();
    const { data, error } = await admin
      .schema("payments")
      .from("plans")
      .insert({
        org_id: orgId,
        name: body.name,
        code: body.code,
        amount_minor: Math.max(0, Number(body.amountMinor ?? 0)),
        currency: body.currency ?? "UZS",
        interval: "month",
        interval_count: Math.max(1, Number(body.intervalCount ?? 1)),
        trial_days: Math.max(0, Number(body.trialDays ?? 0)),
        is_active: body.isActive ?? true,
        metadata: mergeMetadataWithSpic(
          {
            source: "dashboard",
            stage1: true,
          },
          spic,
        ) as any,
      })
      .select("id")
      .single();
    if (error) throw error;

    return NextResponse.json({ ok: true, planId: data.id }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "plans_create_failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  try {
    const { supabase, user } = await getAuthenticatedUserOrThrow();
    const body = (await req.json()) as PlanBody;
    const orgId = parseOrgId(body.orgId);
    if (!body.planId) {
      return NextResponse.json({ error: "planId is required" }, { status: 400 });
    }

    await requireOrgMembership({
      supabase,
      userId: user.id,
      orgId,
      minRole: "admin",
    });

    const admin = createAdminSupabase();
    const patch: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };
    if (typeof body.name === "string") patch.name = body.name;
    if (typeof body.code === "string") patch.code = body.code;
    if (typeof body.amountMinor !== "undefined") patch.amount_minor = Math.max(0, Number(body.amountMinor));
    if (typeof body.currency === "string") patch.currency = body.currency;
    if (typeof body.intervalCount !== "undefined") patch.interval_count = Math.max(1, Number(body.intervalCount));
    if (typeof body.trialDays !== "undefined") patch.trial_days = Math.max(0, Number(body.trialDays));
    if (typeof body.isActive === "boolean") patch.is_active = body.isActive;
    if (typeof body.spic !== "undefined") {
      const { data: existing, error: existingErr } = await admin
        .schema("payments")
        .from("plans")
        .select("metadata")
        .eq("id", body.planId)
        .eq("org_id", orgId)
        .maybeSingle();
      if (existingErr) throw existingErr;
      patch.metadata = mergeMetadataWithSpic(existing?.metadata, normalizeSpic(body.spic)) as any;
    }

    const { error } = await admin
      .schema("payments")
      .from("plans")
      .update(patch)
      .eq("id", body.planId)
      .eq("org_id", orgId);
    if (error) throw error;

    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "plans_patch_failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  try {
    const { supabase, user } = await getAuthenticatedUserOrThrow();
    const body = (await req.json()) as PlanBody;
    const orgId = parseOrgId(body.orgId);
    if (!body.planId) {
      return NextResponse.json({ error: "planId is required" }, { status: 400 });
    }

    await requireOrgMembership({
      supabase,
      userId: user.id,
      orgId,
      minRole: "admin",
    });

    const admin = createAdminSupabase();
    const { error } = await admin
      .schema("payments")
      .from("plans")
      .delete()
      .eq("id", body.planId)
      .eq("org_id", orgId);
    if (error) throw error;

    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "plans_delete_failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
