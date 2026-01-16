import type { ReactNode } from "react";

export default function PreviewCatalogLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <div className="min-h-screen bg-white dark:bg-secondary-background text-foreground">
      {children}
    </div>
  );
}
