import { requireOrgAccess } from "@/lib/org-access";
import { getPayT } from "@/lib/locales/server";
import { WebhooksManager } from "./webhooks-manager.client";

export default async function DashboardWebhooksPage({
  params,
}: {
  params: Promise<{ orgSlug: string }>;
}) {
  const { orgSlug } = await params;
  const org = await requireOrgAccess(orgSlug);
  const environment = process.env.PAY_ENV ?? "live";
  const t = await getPayT();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">{t("page.webhooks.title")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t("page.webhooks.subtitle")}</p>
      </div>

      <WebhooksManager orgId={org.orgId} environment={environment} />
    </div>
  );
}
