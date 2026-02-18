import { NextResponse } from "next/server";
import { createAdminSupabase } from "@/lib/supabase-admin";
import { authenticateMerchantApiKey } from "@/lib/api-keys";

export async function GET(req: Request) {
  try {
    const supabase = createAdminSupabase();
    const auth = await authenticateMerchantApiKey({
      supabase,
      authorizationHeader: req.headers.get("authorization"),
    });

    const { data, error } = await supabase
      .schema("payments")
      .from("plans")
      .select("id, name, code, amount_minor, currency, interval_count, trial_days, is_active")
      .eq("org_id", auth.merchantOrgId)
      .eq("is_active", true)
      .order("amount_minor", { ascending: true });
    if (error) throw error;

    return NextResponse.json({ plans: data ?? [] });
  } catch (error) {
    const message = error instanceof Error ? error.message : "api_plans_failed";
    const status =
      message === "missing_api_key" ||
      message === "invalid_api_key" ||
      message === "invalid_api_key_format" ||
      message === "invalid_api_key_environment"
        ? 401
        : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
