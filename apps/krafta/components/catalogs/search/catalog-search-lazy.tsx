"use client";

import dynamic from "next/dynamic";
import type { CatalogSearchProps } from "./catalog-search";

const CatalogSearchDynamic = dynamic(
  () => import("./catalog-search").then((module) => module.CatalogSearch),
  { ssr: false },
);

export function CatalogSearchLazy(props: CatalogSearchProps) {
  return <CatalogSearchDynamic {...props} />;
}
