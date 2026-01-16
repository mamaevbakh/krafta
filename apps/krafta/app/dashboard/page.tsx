import { redirect } from "next/navigation";
import {
  getDefaultCatalogSlug,
  getDefaultOrgSlug,
} from "@/lib/dashboard/routing";

export default async function DashboardRootPage() {
  const orgSlug = await getDefaultOrgSlug();
  const catalogSlug = await getDefaultCatalogSlug(orgSlug);

  redirect(`/dashboard/${orgSlug}/${catalogSlug}`);
}
