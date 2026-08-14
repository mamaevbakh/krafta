import { NextResponse } from "next/server";

import { requireOrgAccess } from "@/lib/org-access";
import { createAdminSupabase } from "@/lib/supabase-admin";

/**
 * Rename a customer.
 *
 * The name belongs to the MERCHANT, not the payer. We do not ask someone
 * paying for a coffee what to call themselves — the merchant labels their own
 * customers with whatever they will recognise later, and «мама Алишера» is a
 * perfectly good label that no checkout form would ever produce.
 *
 * Scoped through requireOrgAccess and then again by org_id in the update, so a
 * merchant cannot rename another merchant's customer by guessing an id. The
 * second scope is not redundant: the first proves who you are, the second
 * proves the row is yours.
 */
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ customer_id: string }> },
) {
  const { customer_id } = await params;
  const url = new URL(req.url);
  const orgSlug = url.searchParams.get("orgSlug");
  if (!orgSlug) {
    return NextResponse.json({ error: "orgSlug is required" }, { status: 400 });
  }

  // 404 rather than 403 for a slug this user cannot reach — a 403 would confirm
  // the organisation exists, which is an enumeration oracle over the merchant
  // list.
  const org = await requireOrgAccess(orgSlug);

  let body: { name?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (body.name !== null && typeof body.name !== "string") {
    return NextResponse.json({ error: "name must be a string or null" }, { status: 400 });
  }

  // Trimmed, and empty means "clear it" rather than storing a blank string that
  // renders as a nameless row the merchant cannot tell from a missing one.
  const trimmed = typeof body.name === "string" ? body.name.trim() : "";
  const name = trimmed.length > 0 ? trimmed.slice(0, 200) : null;

  const admin = createAdminSupabase();
  const { data, error } = await admin
    .schema("payments")
    .from("customers")
    .update({ name, updated_at: new Date().toISOString() })
    .eq("id", customer_id)
    .eq("org_id", org.orgId)
    .select("id, name")
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ error: "Customer not found" }, { status: 404 });
  }

  return NextResponse.json({ id: data.id, name: data.name });
}
