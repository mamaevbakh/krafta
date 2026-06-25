import { createClient } from "@/lib/supabase/server";
import { normalizeQrStyle } from "@/lib/qr/config";
import { renderQrSvg } from "@/lib/qr/render";
import { normalizeDeliverySettings } from "@/lib/catalogs/settings/delivery";
import { normalizeCurrencySettings } from "@/lib/catalogs/settings/currency";
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
      "id, org_id, name, description, tags, logo_path, settings_currency, settings_delivery, settings_behavior, settings_qr_style",
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

  // Venue is 1:1 with catalog and is backfilled by the migration, so the row
  // is expected to exist. Treat missing as a soft error rather than crashing.
  const { data: venue } = await supabase
    .from("venues")
    .select(
      "id, name, status, modes_enabled, business_hours, currency, timezone, language_code, address, tma_enabled",
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

  // Telegram Mini App: one shared bot hosts every storefront via `startapp`.
  // The deep link + branded QR are derived from the catalog slug; both are
  // shown regardless of the enabled toggle so the merchant can preview before
  // turning it on.
  const tmaBotUsername =
    process.env.TELEGRAM_BOT_USERNAME?.replace(/^@/, "") || null;
  const tmaDeepLink = tmaBotUsername
    ? `https://t.me/${tmaBotUsername}?startapp=${catalogSlug}`
    : null;
  const qrStyle = normalizeQrStyle(catalog.settings_qr_style);
  const tmaQrSvg = tmaDeepLink
    ? await renderQrSvg(tmaDeepLink, { size: 320, style: qrStyle })
    : null;

  const delivery = normalizeDeliverySettings(
    (catalog.settings_delivery ?? {}) as Record<string, unknown>,
  );
  const currency = normalizeCurrencySettings(
    (catalog.settings_currency ?? {}) as Record<string, unknown>,
  );
  const behavior = normalizeBehaviorSettings(
    (catalog.settings_behavior ?? {}) as Record<string, unknown>,
  );
  const deliveryModeEnabled = (venue?.modes_enabled ?? []).includes("delivery");

  // Org-level courier connection state. credentials_encrypted is reduced to a
  // boolean here (server-side) and never forwarded to the client.
  const { data: courierRow } = await supabase
    .schema("commerce")
    .from("org_delivery_settings")
    .select("account_label, is_active, credentials_encrypted")
    .eq("org_id", catalog.org_id)
    .maybeSingle();
  const courierConnected = Boolean(courierRow?.credentials_encrypted);
  const courier = {
    connected: courierConnected,
    accountLabel: courierRow?.account_label ?? null,
    isActive: courierRow?.is_active ?? true,
    usingEnvFallback:
      !courierConnected && Boolean(process.env.YANDEX_DELIVERY_TOKEN),
  };

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
      delivery={delivery}
      currency={currency}
      deliveryModeEnabled={deliveryModeEnabled}
      courier={courier}
      assistantEnabled={behavior.enableAssistant}
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
      miniApp={{
        enabled: venue?.tma_enabled ?? false,
        deepLink: tmaDeepLink,
        botUsername: tmaBotUsername,
        qrSvg: tmaQrSvg,
      }}
    />
  );
}
