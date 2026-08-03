import { NextResponse } from "next/server";
import { createAdminSupabase } from "@/lib/supabase-admin";
import { getAuthenticatedUserOrThrow } from "@/lib/dashboard-auth";
import { createMerchantAccount, userHasAnyOrg } from "@/lib/merchant-account";

/**
 * Create the signed-in user's Krafta Pay merchant account.
 *
 * The last step of making Krafta Pay standalone. Auth already worked for any
 * user — what did not exist was a way to get an *organization*, and without one
 * every `payments.*` row (plans, keys, providers, subscriptions) has nothing to
 * hang off. A merchant who signed up landed on a dashboard reading "No
 * organization memberships found for this user" with no button to press.
 */
export async function POST(req: Request) {
  try {
    const { user } = await getAuthenticatedUserOrThrow();
    const body = (await req.json()) as { name?: string; country?: string };

    const name = typeof body.name === "string" ? body.name.trim() : "";
    if (!name) {
      return NextResponse.json({ error: "name_required" }, { status: 400 });
    }

    const admin = createAdminSupabase();

    // One account per user from this route. A merchant with several businesses
    // is a real case, but it needs an org switcher and an invite flow to not be
    // confusing — and letting a double-submitted form silently create two
    // identical orgs is a worse first impression than a 409.
    if (await userHasAnyOrg(admin, user.id)) {
      return NextResponse.json({ error: "account_already_exists" }, { status: 409 });
    }

    const account = await createMerchantAccount(admin, {
      userId: user.id,
      name,
      countryIso2: typeof body.country === "string" ? body.country.slice(0, 2).toUpperCase() : "UZ",
    });

    return NextResponse.json({ ok: true, account }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "account_create_failed";
    const status =
      message === "unauthorized"
        ? 401
        : message === "name_required" || message === "name_too_long"
          ? 400
          : 500;
    if (status === 500) console.error("merchant account create failed", { message });
    return NextResponse.json({ error: message }, { status });
  }
}
