import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { BrandWordmark } from "@/components/brand/brand-wordmark";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import Link from "next/link";
import { Input } from "@/components/ui/input";
import { Search } from "lucide-react";
import { getDashboardT } from "@/lib/locales/dashboard/server";

export default async function OrgDashboardRedirect({
  params,
}: {
  params: Promise<{ orgSlug: string }>;
}) {
  const { orgSlug } = await params;
  const t = await getDashboardT();

  const supabase = await createClient();
  const { data: org, error: orgError } = await supabase
    .from("organizations")
    .select("id, name, slug")
    .eq("slug", orgSlug)
    .maybeSingle();

  if (orgError || !org) {
    notFound();
  }

  const { data: catalogs, error: catalogsError } = await supabase
    .from("catalogs")
    .select("id, slug, name, created_at")
    .eq("org_id", org.id)
    .order("name", { ascending: true });

  if (catalogsError) {
    notFound();
  }

  const visibleCatalogs = catalogs ?? [];
  if (visibleCatalogs.length === 0) {
    notFound();
  }

  if (visibleCatalogs.length === 1) {
    redirect(`/dashboard/${orgSlug}/${visibleCatalogs[0].slug}`);
  }

  return (
    <main className="min-h-screen bg-secondary-background">
      <div className="mx-auto w-full max-w-5xl px-6 py-10">
        <header className="flex items-center justify-between">
          <BrandWordmark className="text-3xl" />
          <Badge variant="outline">{t("home.badge_dashboard")}</Badge>
        </header>

        <div className="mt-10 flex flex-col gap-2">
          <h1 className="text-3xl font-semibold tracking-tight">{t("home.catalogs_title")}</h1>
          <p className="text-sm text-muted-foreground">
            {t("home.catalogs_subtitle", { name: org.name })}
          </p>
        </div>

        <div className="mt-6 flex items-center gap-2">
          <div className="relative w-full max-w-md">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder={t("home.catalogs_search_placeholder")}
              className="pl-9"
              readOnly
            />
          </div>
        </div>

        <section className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {visibleCatalogs.map((catalog) => (
            <Link
              key={catalog.id}
              href={`/dashboard/${orgSlug}/${catalog.slug}`}
              className="group"
            >
              <Card className="transition-shadow group-hover:shadow-md">
                <CardHeader>
                  <CardTitle className="text-base">{catalog.name}</CardTitle>
                  <CardDescription className="truncate">
                    /{orgSlug}/{catalog.slug}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>{t("home.open_catalog")}</span>
                    <span className="translate-x-0 transition-transform group-hover:translate-x-0.5">
                      →
                    </span>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </section>
      </div>
    </main>
  );
}
