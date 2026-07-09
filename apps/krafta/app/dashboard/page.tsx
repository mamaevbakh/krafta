import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { BrandWordmark } from "@/components/brand/brand-wordmark";
import Link from "next/link";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Search } from "lucide-react";
import { getDashboardT } from "@/lib/locales/dashboard/server";

export default async function DashboardRootPage() {
  const t = await getDashboardT();
  const supabase = await createClient();
  const { data: orgs, error } = await supabase
    .from("organizations")
    .select("id, slug, name, created_at")
    .order("name", { ascending: true });

  if (error) {
    notFound();
  }

  const organizations = orgs ?? [];
  // No orgs/catalogs yet — e.g. an anonymous session carried over from the
  // storefront/landing, or a brand-new account. Don't dead-end at a 404; send
  // them into onboarding to create their first shop. (Later this can become a
  // chooser between "create a shop" and "join an org".)
  if (organizations.length === 0) {
    redirect("/onboarding");
  }

  if (organizations.length === 1) {
    redirect(`/dashboard/${organizations[0].slug}`);
  }

  return (
    <main className="min-h-screen bg-secondary-background">
      <div className="mx-auto w-full max-w-5xl px-6 py-10">
        <header className="flex items-center justify-between">
          <BrandWordmark className="text-3xl" />
          <Badge variant="outline">{t("home.badge_dashboard")}</Badge>
        </header>

        <div className="mt-10 flex flex-col gap-2">
          <h1 className="text-3xl font-semibold tracking-tight">{t("home.orgs_title")}</h1>
          <p className="text-sm text-muted-foreground">
            {t("home.orgs_subtitle")}
          </p>
        </div>

        <div className="mt-6 flex items-center gap-2">
          <div className="relative w-full max-w-md">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder={t("home.orgs_search_placeholder")}
              className="pl-9"
              // Non-interactive for now; keeps the UI consistent with Supabase-style pickers.
              readOnly
            />
          </div>
        </div>

        <section className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {organizations.map((org) => (
            <Link key={org.id} href={`/dashboard/${org.slug}`} className="group">
              <Card className="transition-shadow group-hover:shadow-md">
                <CardHeader>
                  <CardTitle className="text-base">{org.name}</CardTitle>
                  <CardDescription className="truncate">
                    /{org.slug}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>{t("home.open_dashboard")}</span>
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
