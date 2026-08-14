"use client";

import { useMemo, useState } from "react";
import {
  columnFilteringFeature,
  columnVisibilityFeature,
  rowSelectionFeature,
  createColumnHelper,
  createFilteredRowModel,
  createPaginatedRowModel,
  createSortedRowModel,
  FlexRender,
  globalFilteringFeature,
  rowPaginationFeature,
  rowSortingFeature,
  tableFeatures,
  useTable,
  type ColumnVisibilityState,
  type SortingState,
} from "@tanstack/react-table";
import {
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  CircleAlert,
  Clock,
  Columns3,
  Copy,
  ExternalLink,
  MoreVertical,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PayLink } from "@/components/dashboard/pay-link.client";
import { formatMinorAmount } from "@/lib/format";
import { formatPayDate } from "@/lib/format-date";
import { useT, usePayLocale } from "@/lib/locales/context";
import type { OverviewRow } from "@/lib/overview";

/**
 * Everyone who owes money, most overdue first.
 *
 * This is the point of the page. The figures above it are context; this is the
 * only thing on the dashboard a merchant can act on, and the action — re-send
 * the link — sits on the row rather than two clicks away.
 *
 * SEARCH IS THE FEATURE. A merchant's real question is almost never aggregate;
 * it is «Алишер заплатил?» about one person. The tabs answer the other half —
 * "who has not paid" versus "whose card was declined" are different problems
 * with different fixes, and splitting them means neither buries the other.
 *
 * At 375px this becomes a stacked list. Six columns do not fit a phone, and
 * the phone is where this actually gets read (DESIGN.md §Layout).
 */
// v9 requires declaring the features a table uses; anything unregistered is
// tree-shaken rather than shipped.
const features = tableFeatures({
  // globalFilteringFeature and filteredRowModel both depend on this one; v9
  // enforces that in the type system rather than failing at runtime.
  columnFilteringFeature,
  columnVisibilityFeature,
  globalFilteringFeature,
  rowSelectionFeature,
  rowPaginationFeature,
  rowSortingFeature,
  filteredRowModel: createFilteredRowModel(),
  paginatedRowModel: createPaginatedRowModel(),
  sortedRowModel: createSortedRowModel(),
});

const columnHelper = createColumnHelper<typeof features, OverviewRow>();

export function NeedsAttention({ rows }: { rows: OverviewRow[] }) {
  const t = useT();
  const locale = usePayLocale();
  const [sorting, setSorting] = useState<SortingState>([{ id: "createdAt", desc: false }]);
  const [filter, setFilter] = useState("");
  const [tab, setTab] = useState<"all" | "awaiting" | "failed">("all");
  const [columnVisibility, setColumnVisibility] = useState<ColumnVisibilityState>({});
  const [pagination, setPagination] = useState({ pageIndex: 0, pageSize: 10 });
  const [rowSelection, setRowSelection] = useState({});

  const counts = useMemo(
    () => ({
      all: rows.length,
      awaiting: rows.filter((r) => r.kind === "awaiting").length,
      failed: rows.filter((r) => r.kind === "failed").length,
    }),
    [rows],
  );

  const scoped = useMemo(
    () => (tab === "all" ? rows : rows.filter((r) => r.kind === tab)),
    [rows, tab],
  );

  const columns = useMemo(
    () => columnHelper.columns([
      columnHelper.display({
        id: "select",
        header: ({ table }) => (
          <Checkbox
            checked={table.getIsAllPageRowsSelected()}
            indeterminate={table.getIsSomePageRowsSelected()}
            onCheckedChange={(v) => table.toggleAllPageRowsSelected(!!v)}
            aria-label={t("overview.attention.selectAll")}
          />
        ),
        cell: ({ row }) => (
          <Checkbox
            checked={row.getIsSelected()}
            onCheckedChange={(v) => row.toggleSelected(!!v)}
            aria-label={t("overview.attention.selectRow")}
          />
        ),
        enableHiding: false,
      }),
      columnHelper.accessor("description", {
        header: () => t("payments.col.description"),
        cell: ({ row }) => (
          <span className="font-medium">
            {row.original.description ?? t("payments.noDescription")}
          </span>
        ),
      }),
      columnHelper.accessor("amountMinor", {
        header: () => t("payments.col.amount"),
        cell: ({ row }) => (
          <span className="font-mono tabular-nums">
            {formatMinorAmount(row.original.amountMinor, row.original.currency)}
          </span>
        ),
      }),
      columnHelper.accessor("kind", {
        header: () => t("payments.col.status"),
        cell: ({ row }) => <StatusBadge kind={row.original.kind} t={t} />,
      }),
      columnHelper.accessor("createdAt", {
        header: () => t("payments.col.created"),
        cell: ({ row }) => (
          <span className="text-sm text-muted-foreground">
            {formatPayDate(row.original.createdAt, locale, "short")}
          </span>
        ),
      }),
      columnHelper.display({
        id: "link",
        header: () => t("payments.col.link"),
        enableHiding: false,
        cell: ({ row }) =>
          row.original.payUrl ? (
            <PayLink url={row.original.payUrl} className="bg-background" collapseUrlBelowLg />
          ) : (
            <span className="text-sm text-muted-foreground">—</span>
          ),
      }),
      columnHelper.display({
        id: "actions",
        header: () => null,
        enableHiding: false,
        cell: ({ row }) =>
          row.original.payUrl ? (
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-8 text-muted-foreground"
                  >
                    <MoreVertical className="size-4" aria-hidden />
                    <span className="sr-only">{t("overview.attention.rowActions")}</span>
                  </Button>
                }
              />
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuItem
                  onClick={() => navigator.clipboard.writeText(row.original.payUrl!)}
                  className="gap-2"
                >
                  <Copy className="size-4" aria-hidden />
                  {t("payLink.copy")}
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => window.open(row.original.payUrl!, "_blank")}
                  className="gap-2"
                >
                  <ExternalLink className="size-4" aria-hidden />
                  {t("overview.attention.openLink")}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : null,
      }),
    ]),
    [t, locale],
  );

  const table = useTable({
    features,
    data: scoped,
    columns,
    state: { sorting, globalFilter: filter, columnVisibility, pagination, rowSelection },
    onSortingChange: setSorting,
    onGlobalFilterChange: setFilter,
    onColumnVisibilityChange: setColumnVisibility,
    onPaginationChange: setPagination,
    onRowSelectionChange: setRowSelection,
    enableRowSelection: true,
    getRowId: (row) => row.paymentIntentId,
  });

  if (rows.length === 0) {
    // Not an error state — this is the state a merchant wants to be in.
    return (
      <p className="mx-4 rounded-lg border border-dashed px-4 py-10 text-center text-sm text-muted-foreground lg:mx-6">
        {t("overview.attention.empty")}
      </p>
    );
  }

  const page = pagination;

  return (
    <div className="flex w-full flex-col justify-start gap-6">
      <div className="flex flex-col gap-3 px-4 lg:px-6 sm:flex-row sm:items-center sm:justify-between">
        <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
          <TabsList>
            <TabsTrigger value="all">
              {t("overview.attention.tab.all")}
              <Badge variant="secondary" className="ml-1.5 tabular-nums">
                {counts.all}
              </Badge>
            </TabsTrigger>
            <TabsTrigger value="awaiting">
              {t("payments.status.awaiting")}
              <Badge variant="secondary" className="ml-1.5 tabular-nums">
                {counts.awaiting}
              </Badge>
            </TabsTrigger>
            <TabsTrigger value="failed">
              {t("payments.status.failed")}
              <Badge variant="secondary" className="ml-1.5 tabular-nums">
                {counts.failed}
              </Badge>
            </TabsTrigger>
          </TabsList>
        </Tabs>

        <div className="flex items-center gap-2">
          <Input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder={t("overview.attention.search")}
            className="h-8 w-full sm:w-56"
          />
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button variant="outline" size="sm" className="shrink-0">
                  <Columns3 className="size-4" aria-hidden />
                  <span className="hidden lg:inline">{t("overview.attention.columns")}</span>
                </Button>
              }
            />
            <DropdownMenuContent align="end" className="w-44">
              {table
                .getAllColumns()
                .filter((c) => c.getCanHide())
                .map((column) => (
                  <DropdownMenuCheckboxItem
                    key={column.id}
                    checked={column.getIsVisible()}
                    onCheckedChange={(v) => column.toggleVisibility(!!v)}
                  >
                    {columnLabel(column.id, t)}
                  </DropdownMenuCheckboxItem>
                ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Phone: a stacked list. */}
      <ul className="mx-4 divide-y overflow-hidden rounded-lg border sm:hidden lg:mx-6">
        {table.getRowModel().rows.map(({ original: row }) => (
          <li key={row.paymentIntentId} className="space-y-2 p-4">
            <span className="block font-medium">
              {row.description ?? t("payments.noDescription")}
            </span>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-mono tabular-nums">
                {formatMinorAmount(row.amountMinor, row.currency)}
              </span>
              <StatusBadge kind={row.kind} t={t} />
            </div>
            <div className="text-xs text-muted-foreground">
              {formatPayDate(row.createdAt, locale, "short")}
            </div>
            {row.payUrl ? <PayLink url={row.payUrl} className="bg-background" /> : null}
          </li>
        ))}
      </ul>

      <div className="mx-4 hidden overflow-hidden rounded-lg border sm:block lg:mx-6">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((hg) => (
              <TableRow key={hg.id} className="bg-muted/40 hover:bg-muted/40">
                {hg.headers.map((header) => (
                  <TableHead
                    key={header.id}
                    onClick={header.column.getToggleSortingHandler()}
                    className="cursor-pointer px-4 text-xs text-muted-foreground select-none"
                  >
                    <FlexRender header={header} />
                    {{ asc: " ↑", desc: " ↓" }[header.column.getIsSorted() as string] ?? ""}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows.map((row) => (
              <TableRow key={row.id}>
                {row.getVisibleCells().map((cell) => (
                  <TableCell key={cell.id} className="px-4">
                    <FlexRender cell={cell} />
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* Pagination only once it earns its place. Controls under a five-row
          table are furniture. */}
      {scoped.length > page.pageSize ? (
        <div className="flex flex-col gap-3 px-4 lg:px-6 sm:flex-row sm:items-center sm:justify-between">
          <span className="text-sm text-muted-foreground tabular-nums">
            {t("overview.attention.selected", {
              n: String(Object.keys(rowSelection).length),
              total: String(scoped.length),
            })}{" "}
            ·{" "}
            {t("overview.attention.page", {
              page: String(page.pageIndex + 1),
              total: String(table.getPageCount()),
            })}
          </span>
          <div className="flex items-center gap-2">
            <Label htmlFor="rows-per-page" className="text-sm text-muted-foreground">
              {t("overview.attention.perPage")}
            </Label>
            <Select
              value={String(page.pageSize)}
              onValueChange={(v) => table.setPageSize(Number(v))}
            >
              <SelectTrigger size="sm" id="rows-per-page" className="w-18">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {[10, 20, 50].map((n) => (
                  <SelectItem key={n} value={String(n)}>
                    {n}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              variant="outline"
              size="icon"
              className="size-8"
              onClick={() => table.setPageIndex(0)}
              disabled={!table.getCanPreviousPage()}
              aria-label={t("overview.attention.firstPage")}
            >
              <ChevronsLeft className="size-4" aria-hidden />
            </Button>
            <Button
              variant="outline"
              size="icon"
              className="size-8"
              onClick={() => table.previousPage()}
              disabled={!table.getCanPreviousPage()}
              aria-label={t("overview.attention.prevPage")}
            >
              <ChevronLeft className="size-4" aria-hidden />
            </Button>
            <Button
              variant="outline"
              size="icon"
              className="size-8"
              onClick={() => table.nextPage()}
              disabled={!table.getCanNextPage()}
              aria-label={t("overview.attention.nextPage")}
            >
              <ChevronRight className="size-4" aria-hidden />
            </Button>
            <Button
              variant="outline"
              size="icon"
              className="size-8"
              onClick={() => table.setPageIndex(table.getPageCount() - 1)}
              disabled={!table.getCanNextPage()}
              aria-label={t("overview.attention.lastPage")}
            >
              <ChevronsRight className="size-4" aria-hidden />
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

/**
 * The icon carries the meaning at a glance; a declined card and an unopened
 * link are different problems and should not both read as grey text.
 */
function StatusBadge({
  kind,
  t,
}: {
  kind: OverviewRow["kind"];
  t: ReturnType<typeof useT>;
}) {
  if (kind === "failed") {
    return (
      <Badge variant="outline" className="gap-1 text-muted-foreground">
        <CircleAlert className="size-3 text-destructive" aria-hidden />
        {t("payments.status.failed")}
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="gap-1 text-muted-foreground">
      <Clock className="size-3" aria-hidden />
      {t("payments.status.awaiting")}
    </Badge>
  );
}

function columnLabel(id: string, t: ReturnType<typeof useT>) {
  switch (id) {
    case "description":
      return t("payments.col.description");
    case "amountMinor":
      return t("payments.col.amount");
    case "kind":
      return t("payments.col.status");
    case "createdAt":
      return t("payments.col.created");
    default:
      return id;
  }
}
