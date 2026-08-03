import { requireOrgAccess } from "@/lib/org-access";
import { LogsViewerClient } from "./logs-viewer.client";

export default async function DashboardLogsPage({
  params,
  searchParams,
}: {
  params: Promise<{ orgSlug: string }>;
  // publicToken / type stay in the query string on purpose: they are a *view*
  // of this org's logs, not a different resource, and a shared link to one
  // checkout's trace is exactly what you want mid-support-conversation.
  searchParams: Promise<{ publicToken?: string; type?: string }>;
}) {
  const { orgSlug } = await params;
  const org = await requireOrgAccess(orgSlug);
  const sp = await searchParams;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Logs</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Inspect checkout, webhook, callback, and provider logs for payment debugging.
        </p>
      </div>

      <LogsViewerClient
        orgId={org.orgId}
        initialPublicToken={sp.publicToken}
        initialType={sp.type}
      />
    </div>
  );
}
