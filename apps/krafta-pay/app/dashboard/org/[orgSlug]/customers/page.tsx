import { getDashboardEnvironment } from "@/lib/dashboard-env";
import { requireOrgAccess } from "@/lib/org-access";
import { CustomersListClient } from "./customers-list.client";

export default async function DashboardCustomersPage({
  params,
}: {
  params: Promise<{ orgSlug: string }>;
}) {
  const { orgSlug } = await params;
  const org = await requireOrgAccess(orgSlug);
  const environment = await getDashboardEnvironment();

  return (
    <div className="flex flex-col gap-4 md:gap-6">

      <section className="space-y-3">
        <CustomersListClient
          orgId={org.orgId}
          orgSlug={orgSlug}
          environment={environment}
        />
      </section>
    </div>
  );
}
