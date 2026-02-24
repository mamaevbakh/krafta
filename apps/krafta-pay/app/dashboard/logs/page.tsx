import Link from "next/link";
import { getCurrentUserMemberships } from "@/lib/org-memberships";
import { LogsViewerClient } from "./logs-viewer.client";

export default async function DashboardLogsPage({
  searchParams,
}: {
  searchParams: Promise<{ orgId?: string; publicToken?: string; type?: string }>;
}) {
  const memberships = await getCurrentUserMemberships();
  const sp = await searchParams;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Logs</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Inspect checkout, webhook, callback, and provider logs for payment debugging.
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
        <LogsViewerClient
          memberships={memberships}
          initialOrgId={sp.orgId}
          initialPublicToken={sp.publicToken}
          initialType={sp.type}
        />
      )}
    </div>
  );
}
