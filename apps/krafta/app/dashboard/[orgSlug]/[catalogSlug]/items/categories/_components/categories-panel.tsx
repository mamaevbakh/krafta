"use client"

import { Plus } from "lucide-react"
import { useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"

import type { CatalogCategory } from "@/lib/catalogs/types"
import { DataTable } from "./data-table"
import { createColumns } from "./columns"
import { Button } from "@/components/ui/button"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { CategoryEditorDrawer } from "./category-editor-drawer"
import { deleteCategory } from "./actions"
import { useT } from "@/lib/locales/dashboard/context"

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
  const t = useT()
  const [categoryDialogOpen, setCategoryDialogOpen] = useState(false)
  const [editingCategory, setEditingCategory] = useState<CatalogCategory | null>(
    null,
  )
  const [pendingDelete, setPendingDelete] =
    useState<CatalogCategory | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)

  const editingTranslations = useMemo(() => {
    if (!editingCategory) return []
    return translations.filter(
      (translation) => translation.category_id === editingCategory.id,
    )
  }, [editingCategory, translations])

  async function handleConfirmRowDelete() {
    if (!pendingDelete) return
    setIsDeleting(true)
    try {
      const result = await deleteCategory({
        catalogId,
        catalogSlug,
        categoryId: pendingDelete.id,
      })

      if (!result.ok) {
        toast.error(result.error ?? t("categories.error.delete_failed"))
        return
      }

      if (editingCategory?.id === pendingDelete.id) {
        setEditingCategory(null)
        setCategoryDialogOpen(false)
      }

      toast.success(
        result.deletedItems
          ? t("categories.toast.deleted_with_items", {
              count: result.deletedItems,
            })
          : t("categories.toast.deleted"),
      )
      setPendingDelete(null)
      router.refresh()
    } finally {
      setIsDeleting(false)
    }
  }

  return (
    <main className="w-full">
      <div className="w-full border-b">
        <div className="mx-auto flex h-30 max-w-312 items-center justify-between px-6">
          <div className="space-y-1">
            <h1 className="text-[32px] font-semibold tracking-tight">
              {t("categories.title")}
            </h1>
          </div>
          <Button
            onClick={() => {
              setEditingCategory(null)
              setCategoryDialogOpen(true)
            }}
          >
            <Plus className="size-4" />
            {t("categories.create")}
          </Button>
        </div>
      </div>

      <div className="mx-auto max-w-312 px-6 py-8">
        <DataTable
          columns={createColumns({
            t,
            onEdit: (category) => {
              setEditingCategory(category)
              setCategoryDialogOpen(true)
            },
            onDelete: (category) => {
              setPendingDelete(category)
            },
          })}
          data={categories}
          enableStatusTabs
          searchPlaceholder={t("categories.search_placeholder")}
          onRowClick={(category) => {
            setEditingCategory(category)
            setCategoryDialogOpen(true)
          }}
        />
      </div>

      <CategoryEditorDrawer
        open={categoryDialogOpen}
        onOpenChange={(open) => {
          setCategoryDialogOpen(open)
          if (!open) setEditingCategory(null)
        }}
        catalogId={catalogId}
        catalogSlug={catalogSlug}
        locales={locales}
        mode={editingCategory ? "edit" : "create"}
        category={editingCategory ?? undefined}
        initialTranslations={editingTranslations}
        existingSlugs={categories.map((category) => category.slug)}
        onDeleted={() => setEditingCategory(null)}
      />

      <AlertDialog
        open={!!pendingDelete}
        onOpenChange={(open) => {
          if (!open) setPendingDelete(null)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t("categories.delete_confirm.title")}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t("categories.delete_confirm.description", {
                name:
                  pendingDelete?.name ??
                  t("categories.delete_confirm.fallback_name"),
              })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>
              {t("common.cancel")}
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={(event) => {
                event.preventDefault()
                void handleConfirmRowDelete()
              }}
              disabled={isDeleting}
            >
              {t("categories.delete_confirm.action")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </main>
  )
}
