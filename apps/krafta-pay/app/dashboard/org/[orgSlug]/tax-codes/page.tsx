import { requireOrgAccess } from "@/lib/org-access";
import { getPayT } from "@/lib/locales/server";
import { TaxCodesManagerClient } from "./tax-codes-manager.client";

export default async function Page({
  params,
}: {
  params: Promise<{ orgSlug: string }>;
}) {
  const { orgSlug } = await params;
  // Authorized once, here. Pages no longer take an org id from the query string
  // and re-check it themselves.
  const org = await requireOrgAccess(orgSlug);
  const t = await getPayT();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">{t("page.taxCodes.title")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t("page.taxCodes.subtitle")}</p>
      </div>

      <TaxCodesManagerClient orgId={org.orgId} />
    </div>
  );
}
