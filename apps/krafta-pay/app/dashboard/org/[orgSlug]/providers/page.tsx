import { requireOrgAccess } from "@/lib/org-access";
import { getPayT } from "@/lib/locales/server";
import { getDashboardEnvironment } from "@/lib/dashboard-env";
import { ProviderSettingsClient } from "./provider-settings.client";

export default async function Page({
  params,
}: {
  params: Promise<{ orgSlug: string }>;
}) {
  const { orgSlug } = await params;
  // Authorized once, here. Pages no longer take an org id from the query string
  // and re-check it themselves.
  const org = await requireOrgAccess(orgSlug);
  const t = await getPayT();
  // The page shows ONE environment — whichever the sidebar switch is on. Listing
  // both at once was ambiguous in the worst possible place: a merchant could
  // read a connected test account as proof they were ready to take real money.
  const environment = await getDashboardEnvironment();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">{t("page.providers.title")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t("page.providers.subtitle")}</p>
      </div>

      <ProviderSettingsClient orgId={org.orgId} environment={environment} />
    </div>
  );
}
