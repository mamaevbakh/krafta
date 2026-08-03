import Link from "next/link";
import { getCurrentUserMemberships } from "@/lib/org-memberships";
import { WebhooksManager } from "./webhooks-manager.client";

export default async function DashboardWebhooksPage({
  searchParams,
}: {
  searchParams: Promise<{ orgId?: string }>;
}) {
  const memberships = await getCurrentUserMemberships();
  const sp = await searchParams;
  const orgId = sp.orgId || memberships[0]?.orgId || "";
  const environment = process.env.PAY_ENV ?? "live";

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Webhooks</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Krafta Pay tells your app when a subscription renews, fails, or recovers — so you can
            grant or revoke access without polling.
          </p>
        </div>
        <Link className="text-sm underline" href="/dashboard">
          Back to Dashboard
        </Link>
      </div>

      {memberships.length === 0 ? (
        <div className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
          Create your account on the Overview page first.
        </div>
      ) : (
        <WebhooksManager orgId={orgId} environment={environment} />
      )}
    </div>
  );
}
