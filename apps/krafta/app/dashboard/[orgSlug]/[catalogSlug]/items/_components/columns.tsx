"use client"

import Image from "next/image"
import type { ColumnDef } from "@tanstack/react-table"

import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { getItemImageUrl } from "@/lib/catalogs/media"
import { formatPriceCents } from "@/lib/catalogs/pricing"
import type { CurrencySettings } from "@/lib/catalogs/settings/currency"
import type { Item } from "@/lib/catalogs/types"
import type { TranslateFn } from "@/lib/locales/dashboard/messages"

function formatPrice(
  value: number | null,
  t: TranslateFn,
  currencySettings?: CurrencySettings
) {
  if (typeof value !== "number") return t("items.not_available")
  return formatPriceCents(value, currencySettings)
}

function formatCreatedAt(value: string) {
  const dt = value ? new Date(value) : null
  if (!dt || Number.isNaN(dt.valueOf())) return value
  const now = new Date()
  const showYear = dt.getFullYear() !== now.getFullYear()
  return dt.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    ...(showYear ? { year: "numeric" } : {}),
  })
}

function ItemActions({
  item,
  t,
  onEdit,
  onDelete,
  align = "end",
  size = "icon-sm",
}: {
  item: Item
  t: TranslateFn
  onEdit?: (item: Item) => void
  onDelete?: (item: Item) => void
  align?: "start" | "center" | "end"
  size?: "icon" | "icon-sm" | "icon-lg"
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size={size} aria-label={t("items.open_menu")}>
          <span className="sr-only">{t("items.open_menu")}</span>
          <span aria-hidden>⋯</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align={align}>
        <DropdownMenuLabel>{t("items.actions")}</DropdownMenuLabel>
        <DropdownMenuItem
          disabled
          onSelect={(e) => {
            e.preventDefault()
          }}
        >
          {t("items.action_view")}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onSelect={(e) => {
            e.preventDefault()
            onEdit?.(item)
          }}
        >
          {t("common.edit")}
        </DropdownMenuItem>
        <DropdownMenuItem
          onSelect={(e) => {
            e.preventDefault()
            onDelete?.(item)
          }}
        >
          {t("common.delete")}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onSelect={(e) => {
            e.preventDefault()
            void navigator.clipboard?.writeText(item.id)
          }}
        >
          {t("items.copy_id")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export function createColumns(
  t: TranslateFn,
  currencySettings?: CurrencySettings,
  {
    onEdit,
    onDelete,
  }: {
    onEdit?: (item: Item) => void
    onDelete?: (item: Item) => void
  } = {},
): ColumnDef<Item>[] {
  return [
  {
    id: "select",
    header: ({ table }) => (
      <Checkbox
        checked={
          table.getIsAllPageRowsSelected() ||
          (table.getIsSomePageRowsSelected() && "indeterminate")
        }
        onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
        aria-label={t("items.select_all")}
      />
    ),
    cell: ({ row }) => (
      <Checkbox
        checked={row.getIsSelected()}
        onCheckedChange={(value) => row.toggleSelected(!!value)}
        aria-label={t("items.select_row")}
      />
    ),
    enableSorting: false,
    enableHiding: false,
    meta: {
      headerClassName: "hidden sm:table-cell w-[44px]",
      cellClassName: "hidden sm:table-cell",
    },
  },
  {
    accessorKey: "name",
    header: t("items.col_item"),
    meta: {
      cellClassName: "whitespace-normal",
    },
    cell: ({ row }) => {
      const item = row.original
      const imageUrl = getItemImageUrl(item)
      const initials = item.name?.trim()?.slice(0, 2)?.toUpperCase() ?? "?"

      return (
        <div className="flex items-start gap-3 lg:items-center">
          <div className="relative h-11 w-11 overflow-hidden rounded-md border bg-muted/40 lg:h-10 lg:w-10">
            {imageUrl ? (
              <Image
                src={imageUrl}
                alt={item.image_alt || item.name || t("items.item_image_alt")}
                fill
                className="object-cover"
                sizes="40px"
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-xs font-semibold text-muted-foreground">
                {initials}
              </div>
            )}
          </div>
          <div className="relative min-w-0 flex-1">
            <div className="lg:hidden">
              <div className="pr-10 text-sm font-medium text-foreground break-words whitespace-normal">
                {item.name || t("items.untitled_item")}
              </div>
              <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
                <span>{t("items.pricing_label")}</span>
                <span className="text-xs font-medium text-foreground">
                  {formatPrice(item.price_cents, t, currencySettings)}
                </span>
              </div>
              <div className="absolute right-0 top-0">
                <ItemActions item={item} t={t} onEdit={onEdit} onDelete={onDelete} />
              </div>
            </div>

            <div className="hidden lg:block">
              <div className="text-sm font-medium text-foreground break-words whitespace-normal">
                {item.name || t("items.untitled_item")}
              </div>
            </div>
          </div>
        </div>
      )
    },
  },
  {
    accessorKey: "price_cents",
    header: t("items.price"),
    cell: ({ getValue }) => {
      const value = getValue<number | null>()
      return (
        <span className="text-sm font-medium">
          {formatPrice(value, t, currencySettings)}
        </span>
      )
    },
    meta: {
      headerClassName: "hidden sm:table-cell",
      cellClassName: "hidden sm:table-cell",
    },
  },
  {
    accessorKey: "is_active",
    filterFn: (row, id, value) => {
      if (value === undefined) return true
      const isActive = row.getValue<boolean>(id)
      return value === "active" ? isActive : !isActive
    },
    header: () => null,
    cell: () => null,
    enableHiding: false,
    enableSorting: false,
    meta: {
      headerClassName: "hidden",
      cellClassName: "hidden",
    },
  },
  {
    accessorKey: "created_at",
    header: t("items.col_created"),
    cell: ({ getValue }) => {
      const raw = getValue<string>()
      return formatCreatedAt(raw)
    },
    meta: {
      headerClassName: "hidden md:table-cell",
      cellClassName: "hidden md:table-cell",
    },
  },
  {
    id: "actions",
    enableHiding: false,
    meta: {
      headerClassName: "hidden lg:table-cell w-[56px]",
      cellClassName: "hidden lg:table-cell",
    },
    cell: ({ row }) => {
      const item = row.original

      return (
        <ItemActions
          item={item}
          t={t}
          size="icon"
          onEdit={onEdit}
          onDelete={onDelete}
        />
      )
    },
  },
]
}
