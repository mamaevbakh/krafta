"use client"

import { useMemo, useState } from "react"

import type { CatalogCategory } from "@/lib/catalogs/types"
import { DataTable } from "./data-table"
import { createColumns } from "./columns"
import { Button } from "@/components/ui/button"
import { CreateCategoryDrawer } from "./create-category-drawer"

type LocaleOption = {
  id: string
  locale: string
  is_default: boolean
  is_enabled: boolean
  sort_order: number
}

type CategoryTranslation = {
  id: string
  category_id: string
  locale: string
  name: string
  description: string | null
}

type CategoriesPanelProps = {
  catalogId: string
  catalogSlug: string
  categories: CatalogCategory[]
  locales: LocaleOption[]
  translations: CategoryTranslation[]
}

export function CategoriesPanel({
  catalogId,
  catalogSlug,
  categories,
  locales,
  translations,
}: CategoriesPanelProps) {
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [editingCategory, setEditingCategory] = useState<CatalogCategory | null>(
    null,
  )

  const editingTranslations = useMemo(() => {
    if (!editingCategory) return []
    return translations.filter(
      (translation) => translation.category_id === editingCategory.id,
    )
  }, [editingCategory, translations])

  return (
    <main className="w-full">
      <div className="w-full border-b">
        <div className="mx-auto flex h-30 max-w-312 items-center justify-between px-6">
          <div className="space-y-1">
            <h1 className="text-[32px] font-semibold tracking-tight">
              Categories
            </h1>
          </div>
          <Button
            onClick={() => {
              setEditingCategory(null)
              setDrawerOpen(true)
            }}
          >
            Create category
          </Button>
        </div>
      </div>

      <div className="mx-auto max-w-312 px-6 py-8">
        <DataTable
          columns={createColumns({
            onEdit: (category) => {
              setEditingCategory(category)
              setDrawerOpen(true)
            },
          })}
          data={categories}
          enableStatusTabs
          searchPlaceholder="Search categories..."
        />
      </div>

      <CreateCategoryDrawer
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
        catalogId={catalogId}
        catalogSlug={catalogSlug}
        locales={locales}
        mode={editingCategory ? "edit" : "create"}
        category={editingCategory ?? undefined}
        initialTranslations={editingTranslations}
        existingSlugs={categories.map((category) => category.slug)}
      />
    </main>
  )
}
