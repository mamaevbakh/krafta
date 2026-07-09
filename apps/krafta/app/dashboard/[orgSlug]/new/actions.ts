"use server";

import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { createCodedShop } from "@/lib/auth/coded-shop";
import { getDashboardT } from "@/lib/locales/dashboard/server";

export type NewShopState = { error: string | null };

// Server action behind the "New shop" form. Creates a coded shop in the org
// (create_coded_shop RPC re-checks owner/admin) + issues its publishable key,
// then drops the merchant straight into Studio for the new catalog.
export async function createCodedShopAction(
  _prev: NewShopState,
  formData: FormData,
): Promise<NewShopState> {
  const t = await getDashboardT();
  const orgSlug = String(formData.get("orgSlug") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  if (!orgSlug) return { error: t("home.error_missing_org") };

  let target: string;
  try {
    const supabase = await createClient();
    const { data: org } = await supabase
      .from("organizations")
      .select("id")
      .eq("slug", orgSlug)
      .maybeSingle();
    if (!org) return { error: t("home.error_org_not_found") };

    const shop = await createCodedShop({
      orgId: org.id,
      name: name || undefined,
    });
    target = `/dashboard/${shop.orgSlug}/${shop.catalogSlug}/builder?tab=assistant`;
  } catch (error) {
    return { error: (error as Error)?.message || t("home.error_create_failed") };
  }

  // redirect throws NEXT_REDIRECT — must run outside the try/catch.
  redirect(target);
}
