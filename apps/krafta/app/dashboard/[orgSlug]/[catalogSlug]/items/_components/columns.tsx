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

function formatPrice(
  value: number | null,
  currencySettings?: CurrencySettings
) {
  if (typeof value !== "number") return "N/A"
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
  onEdit,
  align = "end",
  size = "icon-sm",
}: {
  item: Item
  onEdit?: (item: Item) => void
  align?: "start" | "center" | "end"
  size?: "icon" | "icon-sm" | "icon-lg"
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size={size} aria-label="Open menu">
          <span className="sr-only">Open menu</span>
          <span aria-hidden>⋯</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align={align}>
        <DropdownMenuLabel>Actions</DropdownMenuLabel>
        <DropdownMenuItem
          disabled
          onSelect={(e) => {
            e.preventDefault()
          }}
        >
          View
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onSelect={(e) => {
            e.preventDefault()
            onEdit?.(item)
          }}
        >
          Edit
        </DropdownMenuItem>
        <DropdownMenuItem
          disabled
          onSelect={(e) => {
            e.preventDefault()
          }}
        >
          Delete (coming soon)
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onSelect={(e) => {
            e.preventDefault()
            void navigator.clipboard?.writeText(item.id)
          }}
        >
          Copy ID
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export function createColumns(
  currencySettings?: CurrencySettings,
  {
    onEdit,
  }: {
    onEdit?: (item: Item) => void
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
        aria-label="Select all"
      />
    ),
    cell: ({ row }) => (
      <Checkbox
        checked={row.getIsSelected()}
        onCheckedChange={(value) => row.toggleSelected(!!value)}
        aria-label="Select row"
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
    header: "Item",
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
                alt={item.image_alt || item.name || "Item image"}
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
                {item.name || "Untitled item"}
              </div>
              <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
                <span>Pricing</span>
                <span className="text-xs font-medium text-foreground">
                  {formatPrice(item.price_cents, currencySettings)}
                </span>
              </div>
              <div className="absolute right-0 top-0">
                <ItemActions item={item} onEdit={onEdit} />
              </div>
            </div>

            <div className="hidden lg:block">
              <div className="text-sm font-medium text-foreground break-words whitespace-normal">
                {item.name || "Untitled item"}
              </div>
            </div>
          </div>
        </div>
      )
    },
  },
  {
    accessorKey: "price_cents",
    header: "Price",
    cell: ({ getValue }) => {
      const value = getValue<number | null>()
      return (
        <span className="text-sm font-medium">
          {formatPrice(value, currencySettings)}
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
    header: "Created",
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

      return <ItemActions item={item} size="icon" onEdit={onEdit} />
    },
  },
]
}
