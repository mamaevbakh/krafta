import type { SectionProps } from "@/lib/catalogs/layout-registry";
import { pickLocalizedField } from "@/lib/catalogs/i18n";

export function SectionBasic({
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
      className="space-y-3"
    >
      <h2 className="text-lg font-semibold">{name}</h2>
      {children}
    </section>
  );
}
