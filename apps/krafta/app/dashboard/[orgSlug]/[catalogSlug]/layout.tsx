import { Suspense } from "react";
import type { ReactNode } from "react";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { DashboardNavbar } from "@/components/dashboard/dashboard-navbar";
import {
  getOrgCatalogSummaries,
  type CatalogSummary,
  type CookieSnapshot,
} from "@/lib/dashboard/catalogs";
import { createClient } from "@/lib/supabase/server";
import {
  isSyntheticTelegramEmail,
  telegramLoginConfigured,
} from "@/lib/auth/telegram-bridge";
import { getUserSafely } from "@krafta/supabase/auth";
import { BrandWordmark } from "@/components/brand/brand-wordmark";
import { CatalogSwitcherSkeleton } from "@/components/dashboard/catalog-switcher";
import type { OrgOption } from "@/components/dashboard/org-switcher";
import { OrgSwitcherSkeleton } from "@/components/dashboard/org-switcher";
import { getOrgBillingEntitlement } from "@/lib/billing/entitlement";
import { PublishBanner } from "./_components/publish-banner";
import { ActivationChecklist } from "./_components/activation-checklist";
import { getChecklistEntries } from "./_components/checklist-data";

type CatalogLayoutProps = {
  children: ReactNode;
  params: Promise<{ orgSlug: string; catalogSlug: string }>;
};

export default function CatalogLayout(props: CatalogLayoutProps) {
  return (
    <Suspense fallback={<CatalogLayoutFallback />}>
      <CatalogLayoutContent {...props} />
    </Suspense>
  );
}

async function CatalogLayoutContent({ children, params }: CatalogLayoutProps) {
  const { orgSlug, catalogSlug } = await params;
  const cookieStore = await cookies();
  const cookieSnapshot: CookieSnapshot = cookieStore
    .getAll()
    .map(({ name, value }) => ({ name, value }));
  const catalogs: CatalogSummary[] = await getOrgCatalogSummaries(
    orgSlug,
    cookieSnapshot,
  );

  // Get current user
  const supabase = await createClient();
  const { data: orgRecord } = await supabase
    .from("organizations")
    .select("id")
    .eq("slug", orgSlug)
    .maybeSingle();
  if (!orgRecord?.id) {
    notFound();
  }

  const { data: catalogRecord } = await supabase
    .from("catalogs")
    .select("id")
    .eq("org_id", orgRecord.id)
    .eq("slug", catalogSlug)
    .maybeSingle();
  if (!catalogRecord?.id) {
    notFound();
  }

  const { data: orgOptionsRaw } = await supabase
    .from("organizations")
    .select("id, slug, name, logo_path")
    .order("name", { ascending: true });
  const orgs: OrgOption[] = (orgOptionsRaw ?? []).map((org) => ({
    id: org.id,
    slug: org.slug,
    name: org.name,
    logo_path: org.logo_path,
  }));

  const entitlement = orgRecord
    ? await getOrgBillingEntitlement(orgRecord.id)
    : null;

  // ADR 0005 §4: a paused venue shows the draft banner + Publish entry point.
  const { data: venueRecord } = await supabase
    .from("venues")
    .select("status")
    .eq("catalog_id", catalogRecord.id)
    .maybeSingle();

  const { user: authUser } = await getUserSafely(supabase);
  const isAnonymousUser = Boolean(
    (authUser as { is_anonymous?: boolean } | null)?.is_anonymous,
  );
  // Telegram-only register leg (KRA-46): the bot username drives the login
  // widget in the "Secure your shop" dialog. Mirrors getPublishPreflight.
  const telegramBotUsername = telegramLoginConfigured()
    ? (process.env.TELEGRAM_BOT_USERNAME?.replace(/^@/, "") ?? null)
    : null;

  // ADR 0005 §3: the floating setup guide follows the merchant across every
  // dashboard page (it renders here in the layout, bottom-right).
  const checklistEntries = await getChecklistEntries(supabase, {
    orgId: orgRecord.id,
    catalogId: catalogRecord.id,
    orgSlug,
    catalogSlug,
    isAnonymous: isAnonymousUser,
  });
  // Telegram-only accounts carry an unroutable synthetic address (KRA-46 /
  // ADR 0006) — show the Telegram handle instead, never the synthetic email.
  const telegramMeta = (
    authUser?.app_metadata as
      | { telegram?: { username?: string | null; first_name?: string } }
      | undefined
  )?.telegram;
  const hideEmail = isSyntheticTelegramEmail(authUser?.email);
  const user = {
    name:
      authUser?.user_metadata?.full_name ||
      telegramMeta?.first_name ||
      (hideEmail ? "User" : authUser?.email?.split("@")[0]) ||
      "User",
    email: hideEmail
      ? telegramMeta?.username
        ? `@${telegramMeta.username}`
        : "Telegram account"
      : authUser?.email || "",
    avatar: authUser?.user_metadata?.avatar_url,
  };

  return (
    <div className="flex min-h-screen flex-col">
      <DashboardNavbar
        orgSlug={orgSlug}
        catalogSlug={catalogSlug}
        orgs={orgs}
        catalogs={catalogs}
        user={user}
        showUpgradeCta={!entitlement || entitlement.status === "locked"}
      />
      {venueRecord?.status === "paused" && (
        <PublishBanner
          orgSlug={orgSlug}
          catalogSlug={catalogSlug}
          isAnonymousUser={isAnonymousUser}
        />
      )}
      <main className="flex-1 bg-secondary-background">{children}</main>
      {checklistEntries.length > 0 && (
        <ActivationChecklist
          catalogId={catalogRecord.id}
          orgSlug={orgSlug}
          catalogSlug={catalogSlug}
          telegramBotUsername={telegramBotUsername}
          entries={checklistEntries}
        />
      )}
    </div>
  );
}

function CatalogLayoutFallback() {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="px-6 py-3 h-16">
        <nav className="h-full flex items-center space-x-4">
          <h1 className="h-full flex items-center text-2xl">
            <BrandWordmark className="text-2xl" />
          </h1>
          <OrgSwitcherSkeleton />
          <CatalogSwitcherSkeleton />
        </nav>
      </header>
      <main className="flex-1 bg-secondary-background" />
    </div>
  );
}
