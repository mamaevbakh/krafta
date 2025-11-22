// app/[...slug]/layout.tsx

import { MadeByKraftaBadge } from "@/components/krafta/made-by-krafta";
import type { ReactNode } from "react";

export default function CatalogLayout({ children }: { children: ReactNode }) {
  return <div className="min-h-screen bg-white dark:bg-secondary-background text-foreground">{children}<MadeByKraftaBadge /></div>;
}
