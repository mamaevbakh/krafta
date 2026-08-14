import { NextResponse } from "next/server";
import { createAdminSupabase } from "@/lib/supabase-admin";

/**
 * The payer tells us who they are.
 *
 * Krafta Pay's checkout asks the customer for a card and nothing else. In
 * production that has produced 35 customers, zero names and zero phone numbers
 * — so the merchant's Customers page is a list of people they cannot recognise
 * and cannot contact, and there is nothing to backfill from. Whatever we do not
 * start collecting now, we will never have.
 *
 * NEVER OVERWRITES. If the merchant already labelled this person — «мама
 * Алишера», which no checkout form would ever produce — that label wins over
 * whatever the payer types. The name on a customer belongs to the merchant;
 * this only fills a blank. The same read decides whether the fields are shown
 * at all, so the rule is enforced here rather than trusted to the UI.
 *
 * OPEN SESSIONS ONLY. The public token is the credential for this page, and it
 * outlives the payment. Without this check, anyone who kept a link from a
 * checkout finished months ago could still rewrite that customer's contact
 * details.
 *
 * Failure is silent by design on the client: this must never be able to stop
 * someone paying. A 500 here loses a name, not a transaction.
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ public_token: string }> },
) {
  try {
    const { public_token } = await params;
    const supabase = createAdminSupabase();

    let body: { name?: unknown; phone?: unknown };
    try {
      body = (await req.json()) as { name?: unknown; phone?: unknown };
    } catch {
      return NextResponse.json({ error: "invalid_json" }, { status: 400 });
    }

    const clean = (value: unknown, max: number) => {
      if (typeof value !== "string") return null;
      const trimmed = value.trim();
      return trimmed.length > 0 ? trimmed.slice(0, max) : null;
    };
    const name = clean(body.name, 200);
    const phone = clean(body.phone, 40);
    if (!name && !phone) return NextResponse.json({ ok: true, saved: false });

    const { data: session, error: sessionErr } = await supabase
      .schema("payments")
      .from("checkout_sessions")
      .select("id, status, customer_id")
      .eq("public_token", public_token)
      .maybeSingle();
    if (sessionErr) throw sessionErr;
    if (!session || session.status !== "open" || !session.customer_id) {
      // Deliberately not distinguished. This endpoint is reachable by anyone
      // holding a link, and telling them which of the three it was would map
      // out other merchants' checkouts one token at a time.
      return NextResponse.json({ ok: true, saved: false });
    }

    const { data: customer, error: customerErr } = await supabase
      .schema("payments")
      .from("customers")
      .select("id, name, phone")
      .eq("id", session.customer_id)
      .maybeSingle();
    if (customerErr) throw customerErr;
    if (!customer) return NextResponse.json({ ok: true, saved: false });

    const patch: Record<string, unknown> = {};
    if (name && !customer.name) patch.name = name;
    if (phone && !customer.phone) patch.phone = phone;
    if (Object.keys(patch).length === 0) {
      return NextResponse.json({ ok: true, saved: false });
    }
    patch.updated_at = new Date().toISOString();

    const { error: updateErr } = await supabase
      .schema("payments")
      .from("customers")
      .update(patch)
      .eq("id", customer.id);
    if (updateErr) throw updateErr;

    return NextResponse.json({ ok: true, saved: true });
  } catch {
    // Swallowed to a 200-shaped failure rather than a 500: the client treats
    // any outcome as "carry on", and an error here is ours, not the payer's.
    return NextResponse.json({ ok: false, saved: false });
  }
}
