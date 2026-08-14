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
    <div className="space-y-8">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Customers</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Everyone you bill, and what they owe you.
        </p>
      </header>

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
