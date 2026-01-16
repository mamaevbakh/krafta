import { redirect } from "next/navigation";
import { getDefaultCatalogSlug } from "@/lib/dashboard/routing";

export default async function OrgDashboardRedirect({
  params,
}: {
  params: Promise<{ orgSlug: string }>;
}) {
  const { orgSlug } = await params;
  const catalogSlug = await getDefaultCatalogSlug(orgSlug);

  redirect(`/dashboard/${orgSlug}/${catalogSlug}`);
}
