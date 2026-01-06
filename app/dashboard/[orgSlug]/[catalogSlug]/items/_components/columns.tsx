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
import type { Item } from "@/lib/catalogs/types"

export const columns: ColumnDef<Item>[] = [
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
  },
  { accessorKey: "id", header: "ID" },
  { accessorKey: "catalog_id", header: "Catalog ID" },
  { accessorKey: "category_id", header: "Category ID" },
  { accessorKey: "name", header: "Name" },
  { accessorKey: "slug", header: "Slug" },
  { accessorKey: "position", header: "Position" },
  {
    accessorKey: "price_cents",
    header: "Price (cents)",
  },
  {
    accessorKey: "is_active",
    header: "Active",
    cell: ({ getValue }) => {
      const value = getValue<boolean>()
      return value ? "true" : "false"
    },
  },
  {
    accessorKey: "image_path",
    header: "Image Path",
    cell: ({ getValue }) => {
      const value = getValue<string | null>()
      return value ?? ""
    },
  },
  {
    accessorKey: "image_alt",
    header: "Image Alt",
    cell: ({ getValue }) => {
      const value = getValue<string | null>()
      return value ?? ""
    },
  },
  {
    accessorKey: "description",
    header: "Description",
    cell: ({ getValue }) => {
      const value = getValue<string | null>()
      return value ?? ""
    },
  },
  {
    accessorKey: "metadata",
    header: "Metadata",
    cell: ({ getValue }) => {
      const value = getValue<unknown>()
      if (!value) return ""
      try {
        return JSON.stringify(value)
      } catch {
        return String(value)
      }
    },
  },
  {
    accessorKey: "created_at",
    header: "Created",
    cell: ({ getValue }) => {
      const raw = getValue<string>()
      const dt = raw ? new Date(raw) : null
      if (!dt || Number.isNaN(dt.valueOf())) return raw
      return dt.toLocaleString()
    },
  },
  {
    id: "actions",
    enableHiding: false,
    cell: ({ row }) => {
      const item = row.original

      return (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" aria-label="Open menu">
              <span className="sr-only">Open menu</span>
              <span aria-hidden>⋯</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
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
              disabled
              onSelect={(e) => {
                e.preventDefault()
              }}
            >
              Edit (coming soon)
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
    },
  },
]
