import { requireOrgAccess } from "@/lib/org-access";
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

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Providers</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Connect the acquirer that will actually charge your customers.
        </p>
      </div>

      <ProviderSettingsClient orgId={org.orgId} />
    </div>
  );
}
