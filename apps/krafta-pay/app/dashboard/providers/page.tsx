import Link from "next/link";
import { getCurrentUserMemberships } from "@/lib/org-memberships";
import { ProviderSettingsClient } from "./provider-settings.client";

export default async function DashboardProvidersPage({
  searchParams,
}: {
  searchParams: Promise<{ orgId?: string }>;
}) {
  const memberships = await getCurrentUserMemberships();
  const sp = await searchParams;
  const orgId = sp.orgId;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Provider Setup</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Configure Uzum credentials for each organization and environment.
          </p>
        </div>
        <Link className="text-sm underline" href="/dashboard">
          Back to Dashboard
        </Link>
      </div>

      {memberships.length === 0 ? (
        <div className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
          No organization memberships found for the current user.
        </div>
      ) : (
        <ProviderSettingsClient memberships={memberships} initialOrgId={orgId} />
      )}
    </div>
  );
}
