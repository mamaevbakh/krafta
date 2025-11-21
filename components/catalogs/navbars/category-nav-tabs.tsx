import Link from "next/link";
import type { CategoryNavProps } from "@/lib/catalogs/layout-registry";

type Props = CategoryNavProps & {
  baseHref: string; // e.g. `/shop-slug`
};

export function CategoryNavTabs({ categories, activeCategoryId, baseHref }: Props) {
  if (!categories.length) return null;

  return (
    <nav className="flex gap-2 overflow-x-auto pb-1">
      {categories.map((category) => {
        const isActive = category.id === activeCategoryId;

        return (
          <Link
            key={category.id}
            href={`${baseHref}/${category.slug ?? category.id}`}
            className={[
              "whitespace-nowrap rounded-xs border px-3 py-1 text-sm transition",
              isActive
                ? "border-foreground bg-foreground text-background"
                : "border-border text-muted-foreground hover:border-foreground hover:text-foreground",
            ].join(" ")}
          >
            {category.name}
          </Link>
        );
      })}
    </nav>
  );
}