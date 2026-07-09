import { notFound } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { BrandWordmark } from "@/components/brand/brand-wordmark";
import { Badge } from "@/components/ui/badge";
import { getDashboardT } from "@/lib/locales/dashboard/server";
import { NewShopForm } from "./new-shop-form";

// "Create a new coded shop" entry point (catalog-switcher already links here).
// Adds a fresh catalog to the org and lands the merchant in Studio for it.
export default async function NewCodedShopPage({
  params,
}: {
  params: Promise<{ orgSlug: string }>;
}) {
  const { orgSlug } = await params;
  const t = await getDashboardT();

  const supabase = await createClient();
  const { data: org } = await supabase
    .from("organizations")
    .select("id, name, slug")
    .eq("slug", orgSlug)
    .maybeSingle();
  if (!org) notFound();

  // Only owners/admins of this org may create a shop.
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) notFound();
  const { data: membership } = await supabase
    .from("organization_members")
    .select("role")
    .eq("org_id", org.id)
    .eq("user_id", user.id)
    .in("role", ["owner", "admin"])
    .maybeSingle();
  if (!membership) notFound();

  return (
    <main className="min-h-screen bg-secondary-background">
      <div className="mx-auto w-full max-w-xl px-6 py-12">
        <header className="flex items-center justify-between">
          <BrandWordmark className="text-2xl" />
          <Badge variant="outline">Krafta Studio · Beta</Badge>
        </header>

        <div className="mt-12 space-y-2">
          <h1 className="text-2xl font-semibold tracking-tight">{t("home.new_shop_title")}</h1>
          <p className="text-sm text-muted-foreground">
            {t("home.new_shop_description")}
          </p>
        </div>

        <div className="mt-8">
          <NewShopForm orgSlug={orgSlug} />
        </div>
      </div>
    </main>
  );
}
