import type { SectionProps } from "@/lib/catalogs/layout-registry";

export function SectionBasic({ category, children }: SectionProps) {
  return (
    <section
      id={`category-${category.slug ?? category.id}`}
      className="space-y-3"
    >
      <h2 className="text-lg font-semibold">{category.name}</h2>
      {children}
    </section>
  );
}
