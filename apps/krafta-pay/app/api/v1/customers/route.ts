import { NextResponse } from "next/server";
import { resolveOrCreateCustomer } from "@krafta/payments-core";
import {
  V1Error,
  authenticateV1,
  optionalString,
  parseLimit,
  readJsonBody,
  requireString,
  v1ErrorResponse,
} from "@/lib/v1";

/**
 * Customers API.
 *
 * The object that makes Krafta Pay usable by anyone other than Krafta. Before
 * this, a "customer" had to be a row in Krafta's own `public.organizations`
 * table — fine when Krafta Catalogs was the only client, impossible for a
 * Telegram bot billing its channel members.
 *
 * A customer here is identified by `externalId`: whatever id the merchant
 * already uses in their own database. They never have to store ours.
 */

type CustomerRow = {
  id: string;
  external_id: string | null;
  name: string | null;
  email: string | null;
  phone: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
};

function serializeCustomer(row: CustomerRow, environment: "test" | "live") {
  return {
    id: row.id,
    object: "customer",
    externalId: row.external_id,
    name: row.name,
    email: row.email,
    phone: row.phone,
    metadata: row.metadata ?? {},
    livemode: environment === "live",
    created: row.created_at,
  };
}

/**
 * Create or update a customer. Idempotent on `externalId` — calling it twice
 * with the same id returns the same customer rather than a duplicate, so a
 * merchant can safely call it on every login without tracking whether they
 * already did.
 */
export async function POST(req: Request) {
  try {
    const { supabase, auth } = await authenticateV1(req);
    const body = await readJsonBody(req);

    const externalId = requireString(body.externalId, "externalId");
    const name = optionalString(body.name);
    const email = optionalString(body.email);
    const phone = optionalString(body.phone);

    const { customerId, created } = await resolveOrCreateCustomer(supabase, {
      merchantOrgId: auth.merchantOrgId,
      environment: auth.environment,
      externalId,
      name,
      email,
      phone,
    });

    if (body.metadata && typeof body.metadata === "object" && !Array.isArray(body.metadata)) {
      const { error } = await supabase
        .schema("payments")
        .from("customers")
        .update({
          metadata: body.metadata as Record<string, never>,
          updated_at: new Date().toISOString(),
        })
        .eq("id", customerId)
        .eq("org_id", auth.merchantOrgId);
      if (error) throw error;
    }

    const { data, error } = await supabase
      .schema("payments")
      .from("customers")
      .select("id, external_id, email, phone, metadata, created_at")
      .eq("id", customerId)
      .single();
    if (error) throw error;

    return NextResponse.json(serializeCustomer(data as CustomerRow, auth.environment), {
      status: created ? 201 : 200,
    });
  } catch (error) {
    return v1ErrorResponse(error);
  }
}

/**
 * List customers, or look one up by `externalId`.
 *
 * Scoped to the key's org AND environment, so a live key can never see test
 * data and vice versa.
 */
export async function GET(req: Request) {
  try {
    const { supabase, auth } = await authenticateV1(req);
    const url = new URL(req.url);
    const externalId = optionalString(url.searchParams.get("externalId"));
    const limit = parseLimit(url.searchParams.get("limit"));

    let query = supabase
      .schema("payments")
      .from("customers")
      .select("id, external_id, email, phone, metadata, created_at")
      .eq("org_id", auth.merchantOrgId)
      .eq("environment", auth.environment)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (externalId) query = query.eq("external_id", externalId);

    const { data, error } = await query;
    if (error) throw error;

    return NextResponse.json({
      object: "list",
      data: (data ?? []).map((row) => serializeCustomer(row as CustomerRow, auth.environment)),
      hasMore: (data ?? []).length === limit,
    });
  } catch (error) {
    return v1ErrorResponse(error);
  }
}

/** Update mutable fields on an existing customer, addressed by `externalId`. */
export async function PATCH(req: Request) {
  try {
    const { supabase, auth } = await authenticateV1(req);
    const body = await readJsonBody(req);
    const externalId = requireString(body.externalId, "externalId");

    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if ("email" in body) patch.email = optionalString(body.email);
    if ("phone" in body) patch.phone = optionalString(body.phone);
    if (body.metadata && typeof body.metadata === "object") patch.metadata = body.metadata;

    const { data, error } = await supabase
      .schema("payments")
      .from("customers")
      .update(patch)
      .eq("org_id", auth.merchantOrgId)
      .eq("environment", auth.environment)
      .eq("external_id", externalId)
      .select("id, external_id, email, phone, metadata, created_at")
      .maybeSingle();
    if (error) throw error;
    if (!data) {
      throw new V1Error("resource_missing", 404, `No customer with externalId \`${externalId}\`.`);
    }

    return NextResponse.json(serializeCustomer(data as CustomerRow, auth.environment));
  } catch (error) {
    return v1ErrorResponse(error);
  }
}
