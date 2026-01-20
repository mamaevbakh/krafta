"use client"

import * as React from "react"
import {
  type ColumnDef,
  type ColumnFiltersState,
  type SortingState,
  type VisibilityState,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
} from "@tanstack/react-table"

import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { cn } from "@/lib/utils"
import { Search } from "lucide-react"

type ColumnMeta = {
  headerClassName?: string
  cellClassName?: string
}

export function DataTable<TData, TValue>({
  columns,
  data,
  defaultPageSize = 25,
  enableStatusTabs = false,
  statusColumnId = "is_active",
  searchPlaceholder = "Search...",
}: {
  columns: ColumnDef<TData, TValue>[]
  data: TData[]
  defaultPageSize?: number
  enableStatusTabs?: boolean
  statusColumnId?: string
  searchPlaceholder?: string
}) {
  const [sorting, setSorting] = React.useState<SortingState>([])
  const [columnFilters, setColumnFilters] = React.useState<ColumnFiltersState>(
    []
  )
  const [columnVisibility, setColumnVisibility] =
    React.useState<VisibilityState>({})
  const [rowSelection, setRowSelection] = React.useState({})

  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onColumnVisibilityChange: setColumnVisibility,
    onRowSelectionChange: setRowSelection,
    state: {
      sorting,
      columnFilters,
      columnVisibility,
      rowSelection,
    },
    initialState: {
      pagination: {
        pageSize: defaultPageSize,
      },
    },
  })

  const selectedCount = table.getFilteredSelectedRowModel().rows.length
  const [statusFilter, setStatusFilter] = React.useState<
    "all" | "active" | "archived"
  >("all")

  React.useEffect(() => {
    if (!enableStatusTabs) return
    const column = table.getColumn(statusColumnId)
    if (!column) return
    if (statusFilter === "all") {
      column.setFilterValue(undefined)
      return
    }
    column.setFilterValue(statusFilter)
  }, [enableStatusTabs, statusColumnId, statusFilter, table])

  const statusCounts = React.useMemo(() => {
    if (!enableStatusTabs) return null
    const total = data.length
    const active = data.reduce((count, row) => {
      const value = (row as { is_active?: boolean }).is_active
      return value ? count + 1 : count
    }, 0)
    const archived = total - active
    return { total, active, archived }
  }, [data, enableStatusTabs])

  return (
    <div className="w-full space-y-4">
      {enableStatusTabs && statusCounts ? (
        <div className="flex w-full gap-3">
          {[
            { id: "all", label: "All", value: statusCounts.total },
            { id: "active", label: "Active", value: statusCounts.active },
            { id: "archived", label: "Archived", value: statusCounts.archived },
          ].map((card) => (
            <button
              key={card.id}
              type="button"
              onClick={() =>
                setStatusFilter(card.id as "all" | "active" | "archived")
              }
              className={[
                "min-w-0 flex-1 rounded-lg border px-3 py-3 text-left transition",
                statusFilter === card.id
                  ? "border-foreground/40 bg-muted/40"
                  : "border-border hover:border-foreground/30",
              ].join(" ")}
            >
              <div className="text-sm font-medium text-muted-foreground">
                {card.label}
              </div>
              <div className="mt-2 text-2xl font-semibold">{card.value}</div>
            </button>
          ))}
        </div>
      ) : null}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder={searchPlaceholder}
              value={
                (table.getColumn("name")?.getFilterValue() as string) ?? ""
              }
              onChange={(event) =>
                table.getColumn("name")?.setFilterValue(event.target.value)
              }
              className="w-[220px] pl-9"
            />
          </div>
          <div className="text-xs text-muted-foreground">
            {selectedCount > 0
              ? `${selectedCount} selected`
              : `${table.getFilteredRowModel().rows.length} rows`}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm">
                Columns
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel>Toggle columns</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {table
                .getAllColumns()
                .filter((column) => column.getCanHide())
                .map((column) => (
                  <DropdownMenuCheckboxItem
                    key={column.id}
                    className="capitalize"
                    checked={column.getIsVisible()}
                    onCheckedChange={(value) =>
                      column.toggleVisibility(!!value)
                    }
                  >
                    {column.id}
                  </DropdownMenuCheckboxItem>
                ))}
            </DropdownMenuContent>
          </DropdownMenu>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                disabled={selectedCount === 0}
              >
                Bulk actions
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel>Bulk actions</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuCheckboxItem checked disabled>
                (Read-only for now)
              </DropdownMenuCheckboxItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <div className="rounded-md border bg-background">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <TableHead
                    key={header.id}
                    className={cn(
                      (header.column.columnDef.meta as ColumnMeta | undefined)
                        ?.headerClassName
                    )}
                  >
                    {header.isPlaceholder
                      ? null
                      : flexRender(
                          header.column.columnDef.header,
                          header.getContext()
                        )}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows?.length ? (
              table.getRowModel().rows.map((row) => (
                <TableRow
                  key={row.id}
                  data-state={row.getIsSelected() && "selected"}
                >
                  {row.getVisibleCells().map((cell) => (
                    <TableCell
                      key={cell.id}
                      className={cn(
                        (cell.column.columnDef.meta as ColumnMeta | undefined)
                          ?.cellClassName
                      )}
                    >
                      {flexRender(
                        cell.column.columnDef.cell,
                        cell.getContext()
                      )}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell
                  colSpan={columns.length}
                  className="h-24 text-center"
                >
                  No results.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <div className="flex items-center justify-end gap-2 py-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => table.previousPage()}
          disabled={!table.getCanPreviousPage()}
        >
          Previous
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => table.nextPage()}
          disabled={!table.getCanNextPage()}
        >
          Next
        </Button>
      </div>
    </div>
  )
}
