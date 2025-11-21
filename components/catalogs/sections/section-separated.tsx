import type { SectionProps } from "@/lib/catalogs/layout-registry";

export function SectionSeparated({ category, children }: SectionProps) {
  return (
    <section className="space-y-4 border-b border-border pb-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">{category.name}</h2>
      </div>
      {children}
    </section>
  );
}