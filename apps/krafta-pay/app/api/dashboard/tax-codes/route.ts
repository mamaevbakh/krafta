import { NextResponse } from "next/server";
import { createAdminSupabase } from "@/lib/supabase-admin";
import {
  getAuthenticatedUserOrThrow,
  requireOrgMembership,
} from "@/lib/dashboard-auth";

type TaxCodeEntryInput = {
  taxCode?: string;
  packageCode?: string;
  title?: string | null;
};

type UpsertTaxCodesBody = {
  orgId: string;
  schemaCode?: string;
  registryName?: string;
  source?: string | null;
  replace?: boolean;
  entries?: TaxCodeEntryInput[];
};

function parseOrgId(value: unknown) {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error("orgId_required");
  }
  return value.trim();
}

function parseNonEmpty(value: unknown, field: string) {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${field}_required`);
  }
  return value.trim();
}

function normalizeEntry(entry: TaxCodeEntryInput) {
  const taxCode = parseNonEmpty(entry.taxCode, "taxCode");
  const packageCode = parseNonEmpty(entry.packageCode, "packageCode");
  return {
    taxCode,
    packageCode,
    title: typeof entry.title === "string" && entry.title.trim() ? entry.title.trim() : null,
  };
}

async function ensureSchemaByCode(admin: any, schemaCode: string) {
  const { data: existing, error: existingErr } = await admin
    .schema("payments")
    .from("tax_schemas")
    .select("id, code")
    .eq("code", schemaCode)
    .maybeSingle();
  if (existingErr) throw existingErr;
  if (existing?.id) return existing.id as string;

  const { data: created, error: createErr } = await admin
    .schema("payments")
    .from("tax_schemas")
    .insert({
      code: schemaCode,
      name: schemaCode,
      country_iso2: "UZ",
      version: "v1",
      is_active: true,
      metadata: {},
    })
    .select("id")
    .single();
  if (createErr) throw createErr;
  return created.id as string;
}

async function ensureRegistry(admin: any, params: {
  orgId: string;
  schemaId: string;
  registryName: string;
  source?: string | null;
}) {
  const { data: existing, error: existingErr } = await admin
    .schema("payments")
    .from("tax_code_registries")
    .select("id")
    .eq("org_id", params.orgId)
    .eq("schema_id", params.schemaId)
    .eq("name", params.registryName)
    .maybeSingle();
  if (existingErr) throw existingErr;
  if (existing?.id) return existing.id as string;

  const { data: created, error: createErr } = await admin
    .schema("payments")
    .from("tax_code_registries")
    .insert({
      org_id: params.orgId,
      schema_id: params.schemaId,
      name: params.registryName,
      source: params.source ?? null,
      is_active: true,
      metadata: {},
    })
    .select("id")
    .single();
  if (createErr) throw createErr;
  return created.id as string;
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

    const admin = createAdminSupabase() as any;
    const { data: registries, error: registriesErr } = await admin
      .schema("payments")
      .from("tax_code_registries")
      .select("id, name, source, is_active, schema_id, created_at, updated_at")
      .eq("org_id", orgId)
      .order("created_at", { ascending: false });
    if (registriesErr) throw registriesErr;

    const registryIds = (registries ?? []).map((r: any) => r.id).filter(Boolean);
    const { data: entries, error: entriesErr } = registryIds.length
      ? await admin
          .schema("payments")
          .from("tax_code_entries")
          .select("id, registry_id, tax_code, package_code, title, created_at, updated_at")
          .in("registry_id", registryIds)
          .order("created_at", { ascending: false })
      : { data: [], error: null };
    if (entriesErr) throw entriesErr;

    const grouped = new Map<string, any[]>();
    for (const entry of entries ?? []) {
      const list = grouped.get(entry.registry_id) ?? [];
      list.push(entry);
      grouped.set(entry.registry_id, list);
    }

    const result = (registries ?? []).map((registry: any) => ({
      ...registry,
      entries: grouped.get(registry.id) ?? [],
    }));

    return NextResponse.json({ registries: result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "tax_codes_get_failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const { supabase, user } = await getAuthenticatedUserOrThrow();
    const body = (await req.json()) as UpsertTaxCodesBody;
    const orgId = parseOrgId(body.orgId);
    const schemaCode = typeof body.schemaCode === "string" && body.schemaCode.trim()
      ? body.schemaCode.trim()
      : "UZ_AUTOFISCAL_V1";
    const registryName = typeof body.registryName === "string" && body.registryName.trim()
      ? body.registryName.trim()
      : "Default UZ Registry";
    const replace = Boolean(body.replace);
    const entries = Array.isArray(body.entries) ? body.entries.map(normalizeEntry) : [];

    if (entries.length === 0) {
      return NextResponse.json({ error: "entries_required" }, { status: 400 });
    }

    await requireOrgMembership({
      supabase,
      userId: user.id,
      orgId,
      minRole: "admin",
    });

    const admin = createAdminSupabase() as any;
    const schemaId = await ensureSchemaByCode(admin, schemaCode);
    const registryId = await ensureRegistry(admin, {
      orgId,
      schemaId,
      registryName,
      source: body.source ?? "dashboard_upload",
    });

    if (replace) {
      const { error: wipeErr } = await admin
        .schema("payments")
        .from("tax_code_entries")
        .delete()
        .eq("registry_id", registryId);
      if (wipeErr) throw wipeErr;
    }

    const payload = entries.map((entry) => ({
      registry_id: registryId,
      tax_code: entry.taxCode,
      package_code: entry.packageCode,
      title: entry.title,
      metadata: {},
      updated_at: new Date().toISOString(),
    }));

    const { error: upsertErr } = await admin
      .schema("payments")
      .from("tax_code_entries")
      .upsert(payload, { onConflict: "registry_id,tax_code,package_code" });
    if (upsertErr) throw upsertErr;

    return NextResponse.json({
      ok: true,
      registryId,
      imported: entries.length,
      schemaCode,
      registryName,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "tax_codes_upsert_failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
