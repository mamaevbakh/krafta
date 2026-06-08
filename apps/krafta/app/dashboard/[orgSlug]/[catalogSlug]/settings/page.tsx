import { createClient } from "@/lib/supabase/server";
import { SettingsPanel } from "./_components/settings-panel";

type PageProps = {
  params: Promise<{ orgSlug: string; catalogSlug: string }>;
};

export default async function DashboardSettingsPage({ params }: PageProps) {
  const { catalogSlug } = await params;
  const supabase = await createClient();

  const { data: catalog } = await supabase
    .from("catalogs")
    .select("id, org_id, name, description, tags, logo_path")
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

  // Venue is 1:1 with catalog and is backfilled by the migration, so the row
  // is expected to exist. Treat missing as a soft error rather than crashing.
  const { data: venue } = await supabase
    .from("venues")
    .select(
      "id, name, status, modes_enabled, business_hours, currency, timezone, language_code, address",
    )
    .eq("catalog_id", catalog.id)
    .maybeSingle();

  // Current Telegram notification state for the Notifications tab. Select
  // ONLY non-secret columns — the encrypted token never reaches the
  // browser. Connectivity is derived from bot_username / chat_id presence.
  const { data: telegram } = venue
    ? await supabase
        .schema("commerce")
        .from("venue_telegram_settings")
        .select("bot_username, chat_id, chat_title, is_active")
        .eq("venue_id", venue.id)
        .maybeSingle()
    : { data: null };

  return (
    <SettingsPanel
      catalogId={catalog.id}
      catalogSlug={catalogSlug}
      orgId={catalog.org_id}
      name={catalog.name}
      description={catalog.description ?? ""}
      tags={catalog.tags ?? []}
      logoPath={catalog.logo_path ?? ""}
      venue={venue}
      venueId={venue?.id ?? null}
      telegram={
        telegram
          ? {
              botUsername: telegram.bot_username,
              chatConnected: Boolean(telegram.chat_id),
              chatTitle: telegram.chat_title,
              isActive: telegram.is_active,
            }
          : null
      }
    />
  );
}
