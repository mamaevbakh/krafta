import { requireOrgAccess } from "@/lib/org-access";
import { WebhooksManager } from "./webhooks-manager.client";

export default async function DashboardWebhooksPage({
  params,
}: {
  params: Promise<{ orgSlug: string }>;
}) {
  const { orgSlug } = await params;
  const org = await requireOrgAccess(orgSlug);
  const environment = process.env.PAY_ENV ?? "live";

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Webhooks</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Krafta Pay tells your app when a subscription renews, fails, or recovers — so you can
          grant or revoke access without polling.
        </p>
      </div>

      <WebhooksManager orgId={org.orgId} environment={environment} />
    </div>
  );
}
