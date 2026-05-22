import type { SectionProps } from "@/lib/catalogs/layout-registry";
import { pickLocalizedField } from "@/lib/catalogs/i18n";

export function SectionSeparated({
  category,
  children,
  activeLocale,
  defaultLocale,
}: SectionProps) {
  const name = pickLocalizedField({
    translations: category.translations,
    defaults: {
      name: category.name,
      description: category.description ?? null,
      image_alt: null,
    },
    activeLocale,
    defaultLocale,
    field: "name",
  }).value;

  return (
    <section
      id={`category-${category.slug ?? category.id}`}
      className="space-y-4 border-b border-border pb-6"
    >
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">{name}</h2>
      </div>
      {children}
    </section>
  );
}
