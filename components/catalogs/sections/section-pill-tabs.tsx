import type { SectionProps } from "@/lib/catalogs/layout-registry";

export function SectionPillTabs({ category, children }: SectionProps) {
  return (
    <section className="space-y-3">
      <h2 className="text-lg font-semibold">{category.name}</h2>
      {/* 
        Later you will add real UI: horizontal scroll tabs, etc.
        For now keep it basic.
      */}
      {children}
    </section>
  );
}