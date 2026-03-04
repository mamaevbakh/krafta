import { getCatalogAssetUrl } from "@/lib/catalogs/media";

export function getOrgAssetUrl(path: string | null | undefined): string | null {
  return getCatalogAssetUrl(path);
}

