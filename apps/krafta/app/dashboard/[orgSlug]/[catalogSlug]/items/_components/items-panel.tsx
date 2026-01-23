"use client"

import { useMemo, useState } from "react"

import type { CatalogCategory, Item } from "@/lib/catalogs/types"
import type { CurrencySettings } from "@/lib/catalogs/settings/currency"
import { DataTable } from "./data-table"
import { createColumns } from "./columns"
import { Button } from "@/components/ui/button"
import { CreateItemDrawer } from "./create-item-drawer"

type LocaleOption = {
  id: string
  locale: string
  is_default: boolean
  is_enabled: boolean
  sort_order: number
}

type ItemTranslation = {
  id: string
  item_id: string
  locale: string
  name: string
  description: string | null
  image_alt: string | null
}

type ItemMedia = {
  id: string
  item_id: string
  bucket: string
  storage_path: string
  mime_type: string | null
  kind: "image" | "video"
  title: string | null
  alt: string | null
  position: number
  is_primary: boolean
}

type ItemsPanelProps = {
  catalogId: string
  catalogSlug: string
  orgId: string
  categories: CatalogCategory[]
  items: Item[]
  locales: LocaleOption[]
  translations: ItemTranslation[]
  media: ItemMedia[]
  currencySettings: CurrencySettings
}

export function ItemsPanel({
  catalogId,
  catalogSlug,
  orgId,
  categories,
  items,
  locales,
  translations,
  media,
  currencySettings,
}: ItemsPanelProps) {
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [editingItem, setEditingItem] = useState<Item | null>(null)

  const editingTranslations = useMemo(() => {
    if (!editingItem) return []
    return translations.filter(
      (translation) => translation.item_id === editingItem.id,
    )
  }, [editingItem, translations])

  const editingMedia = useMemo(() => {
    if (!editingItem) return []
    return media.filter((entry) => entry.item_id === editingItem.id)
  }, [editingItem, media])

  return (
    <main className="w-full">
      <div className="w-full border-b">
        <div className="mx-auto flex h-[120px] max-w-[1248px] items-center justify-between px-6">
          <div className="space-y-1">
            <h1 className="text-[32px] font-semibold tracking-tight">Items</h1>
          </div>
          <Button
            onClick={() => {
              setEditingItem(null)
              setDrawerOpen(true)
            }}
          >
            Add item
          </Button>
        </div>
      </div>

      <div className="mx-auto max-w-[1248px] px-5 py-4">
        <DataTable
          columns={createColumns(currencySettings, {
            onEdit: (item) => {
              setEditingItem(item)
              setDrawerOpen(true)
            },
          })}
          data={items}
          enableStatusTabs
          searchPlaceholder="Search items..."
        />
      </div>

      <CreateItemDrawer
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
        orgId={orgId}
        catalogId={catalogId}
        catalogSlug={catalogSlug}
        categories={categories}
        locales={locales}
        mode={editingItem ? "edit" : "create"}
        item={editingItem ?? undefined}
        initialTranslations={editingTranslations}
        initialMedia={editingMedia}
      />
    </main>
  )
}
