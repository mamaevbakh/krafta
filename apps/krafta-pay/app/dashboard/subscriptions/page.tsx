import Link from "next/link";
import { getCurrentUserMemberships } from "@/lib/org-memberships";
import { SubscriptionsListClient } from "./subscriptions-list.client";

export default async function DashboardSubscriptionsPage({
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
          <h1 className="text-2xl font-semibold">Subscriptions</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Monitor live subscription lifecycle and billing states.
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
        <SubscriptionsListClient memberships={memberships} initialOrgId={orgId} />
      )}
    </div>
  );
}
