import { createClient } from "@/lib/supabase/server";
import { normalizeBehaviorSettings } from "@/lib/catalogs/settings/behavior";
import { SettingsPanel } from "./_components/settings-panel";

type PageProps = {
  params: Promise<{ orgSlug: string; catalogSlug: string }>;
};

export default async function DashboardSettingsPage({ params }: PageProps) {
  const { catalogSlug } = await params;
  const supabase = await createClient();

  const { data: catalog } = await supabase
    .from("catalogs")
    .select(
      "id, org_id, name, description, tags, logo_path, settings_behavior",
    )
    .eq("slug", catalogSlug)
    .maybeSingle();

  if (!catalog) {
    return (
      <main className="w-full">
        <div className="mx-auto max-w-[1248px] px-6 py-8">
          <p className="text-sm text-muted-foreground">
            Catalog not found.
          </p>
        </div>
      </main>
    );
  }

  const behavior = normalizeBehaviorSettings(
    typeof catalog.settings_behavior === "object" &&
      catalog.settings_behavior !== null
      ? (catalog.settings_behavior as Record<string, unknown>)
      : {},
  );

  return (
    <SettingsPanel
      catalogId={catalog.id}
      catalogSlug={catalogSlug}
      orgId={catalog.org_id}
      name={catalog.name}
      description={catalog.description ?? ""}
      tags={catalog.tags ?? []}
      logoPath={catalog.logo_path ?? ""}
      enableCart={behavior.enableCart}
    />
  );
}
