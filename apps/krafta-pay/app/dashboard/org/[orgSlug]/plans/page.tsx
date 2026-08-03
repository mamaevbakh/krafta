import { requireOrgAccess } from "@/lib/org-access";
import { PlansManagerClient } from "./plans-manager.client";

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
        <h1 className="text-2xl font-semibold">Plans</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          What you charge, how often, and in which currency.
        </p>
      </div>

      <PlansManagerClient orgId={org.orgId} />
    </div>
  );
}
