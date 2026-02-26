"use client"

import { Plus } from "lucide-react"
import { useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"

import type { CatalogCategory } from "@/lib/catalogs/types"
import { DataTable } from "./data-table"
import { createColumns } from "./columns"
import { Button } from "@/components/ui/button"
import { CreateCategoryDialog } from "./create-category-dialog"
import { deleteCategory } from "./actions"

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
  const router = useRouter()
  const [categoryDialogOpen, setCategoryDialogOpen] = useState(false)
  const [editingCategory, setEditingCategory] = useState<CatalogCategory | null>(
    null,
  )

  const editingTranslations = useMemo(() => {
    if (!editingCategory) return []
    return translations.filter(
      (translation) => translation.category_id === editingCategory.id,
    )
  }, [editingCategory, translations])

  async function handleDeleteCategory(category: CatalogCategory) {
    const shouldDelete = window.confirm(
      `Delete "${category.name}" and all of its items? This cannot be undone.`,
    )
    if (!shouldDelete) return

    const result = await deleteCategory({
      catalogId,
      catalogSlug,
      categoryId: category.id,
    })

    if (!result.ok) {
      toast.error(result.error ?? "Failed to delete category.")
      return
    }

    if (editingCategory?.id === category.id) {
      setEditingCategory(null)
      setCategoryDialogOpen(false)
    }

    toast.success("Category deleted.")
    router.refresh()
  }

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
              setCategoryDialogOpen(true)
            }}
          >
            <Plus className="size-4" />
            Create category
          </Button>
        </div>
      </div>

      <div className="mx-auto max-w-312 px-6 py-8">
        <DataTable
          columns={createColumns({
            onEdit: (category) => {
              setEditingCategory(category)
              setCategoryDialogOpen(true)
            },
            onDelete: (category) => {
              void handleDeleteCategory(category)
            },
          })}
          data={categories}
          enableStatusTabs
          searchPlaceholder="Search categories..."
          onRowClick={(category) => {
            setEditingCategory(category)
            setCategoryDialogOpen(true)
          }}
        />
      </div>

      <CreateCategoryDialog
        open={categoryDialogOpen}
        onOpenChange={setCategoryDialogOpen}
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
