"use client"

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
import type { CatalogCategory } from "@/lib/catalogs/types"

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

function CategoryActions({
  category,
  onEdit,
  align = "end",
  size = "icon-sm",
}: {
  category: CatalogCategory
  onEdit?: (category: CatalogCategory) => void
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
            onEdit?.(category)
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
            void navigator.clipboard?.writeText(category.id)
          }}
        >
          Copy ID
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export const columns: ColumnDef<CatalogCategory>[] = [
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
    header: "Category",
    meta: {
      cellClassName: "whitespace-normal",
    },
    cell: ({ row }) => {
      const category = row.original
      return (
        <div className="relative min-w-0">
          <div className="lg:hidden">
            <div className="pr-10 text-sm font-medium text-foreground break-words whitespace-normal">
              {category.name || "Untitled category"}
            </div>
            <div className="absolute right-0 top-0">
              <CategoryActions category={category} />
            </div>
          </div>
          <div className="hidden lg:block">
            <div className="text-sm font-medium text-foreground break-words whitespace-normal">
              {category.name || "Untitled category"}
            </div>
          </div>
        </div>
      )
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
      const category = row.original

      return <CategoryActions category={category} size="icon" />
    },
  },
]

export function createColumns({
  onEdit,
}: {
  onEdit?: (category: CatalogCategory) => void
}): ColumnDef<CatalogCategory>[] {
  return columns.map((column) => {
    if (column.id === "actions") {
      return {
        ...column,
        cell: ({ row }) => {
          const category = row.original
          return (
            <CategoryActions category={category} size="icon" onEdit={onEdit} />
          )
        },
      }
    }

    if (column.accessorKey === "name") {
      return {
        ...column,
        cell: ({ row }) => {
          const category = row.original
          return (
            <div className="relative min-w-0">
              <div className="lg:hidden">
                <div className="pr-10 text-sm font-medium text-foreground break-words whitespace-normal">
                  {category.name || "Untitled category"}
                </div>
                <div className="absolute right-0 top-0">
                  <CategoryActions category={category} onEdit={onEdit} />
                </div>
              </div>
              <div className="hidden lg:block">
                <div className="text-sm font-medium text-foreground break-words whitespace-normal">
                  {category.name || "Untitled category"}
                </div>
              </div>
            </div>
          )
        },
      }
    }

    return column
  })
}
