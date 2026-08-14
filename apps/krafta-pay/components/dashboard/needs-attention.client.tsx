"use client";

import { useMemo, useState } from "react";
import {
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type SortingState,
} from "@tanstack/react-table";

import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { PayLink } from "@/components/dashboard/pay-link.client";
import { formatMinorAmount } from "@/lib/format";
import { formatPayDate } from "@/lib/format-date";
import { useT, usePayLocale } from "@/lib/locales/context";
import type { OverviewRow } from "@/lib/overview";

/**
 * Everyone who owes money, most overdue first.
 *
 * This is the point of the page. The numbers above it are context; this is the
 * only thing on the dashboard a merchant can act on, and the action — re-send
 * the link — is on the row rather than two clicks away.
 *
 * SEARCH IS THE FEATURE. A merchant's real question is almost never aggregate;
 * it is «Алишер заплатил?» about one specific person. Sorting turns the same
 * table into a worklist, so both questions are answered by one surface instead
 * of two screens.
 *
 * At 375px the table becomes a stacked list — the same reasoning as the
 * payments page. Four columns do not fit a phone, and the phone is where
 * Galaktika checks this (DESIGN.md §Layout).
 */
export function NeedsAttention({ rows }: { rows: OverviewRow[] }) {
  const t = useT();
  const locale = usePayLocale();
  const [sorting, setSorting] = useState<SortingState>([{ id: "createdAt", desc: false }]);
  const [filter, setFilter] = useState("");

  const columns = useMemo<ColumnDef<OverviewRow>[]>(
    () => [
      {
        accessorKey: "description",
        header: () => t("payments.col.description"),
        cell: ({ row }) => (
          <span className="font-medium">
            {row.original.description ?? t("payments.noDescription")}
          </span>
        ),
      },
      {
        accessorKey: "amountMinor",
        header: () => t("payments.col.amount"),
        cell: ({ row }) => (
          <span className="font-mono tabular-nums">
            {formatMinorAmount(row.original.amountMinor, row.original.currency)}
          </span>
        ),
      },
      {
        accessorKey: "kind",
        header: () => t("payments.col.status"),
        cell: ({ row }) => (
          <Badge variant={row.original.kind === "failed" ? "outline" : "secondary"}>
            {row.original.kind === "failed"
              ? t("payments.status.failed")
              : t("payments.status.awaiting")}
          </Badge>
        ),
      },
      {
        accessorKey: "createdAt",
        header: () => t("payments.col.created"),
        cell: ({ row }) => (
          <span className="text-sm text-muted-foreground">
            {formatPayDate(row.original.createdAt, locale, "short")}
          </span>
        ),
      },
    ],
    [t, locale],
  );

  const table = useReactTable({
    data: rows,
    columns,
    state: { sorting, globalFilter: filter },
    onSortingChange: setSorting,
    onGlobalFilterChange: setFilter,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
  });

  if (rows.length === 0) {
    // Not an error state — this is the state a merchant wants to be in.
    return (
      <p className="rounded-lg border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">
        {t("overview.attention.empty")}
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <Input
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        placeholder={t("overview.attention.search")}
        className="max-w-xs"
      />

      {/* Phone: a stacked list. */}
      <ul className="divide-y rounded-lg border sm:hidden">
        {table.getRowModel().rows.map(({ original: row }) => (
          <li key={row.paymentIntentId} className="space-y-2 p-4">
            <span className="block font-medium">
              {row.description ?? t("payments.noDescription")}
            </span>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-mono tabular-nums">
                {formatMinorAmount(row.amountMinor, row.currency)}
              </span>
              <Badge variant={row.kind === "failed" ? "outline" : "secondary"}>
                {row.kind === "failed"
                  ? t("payments.status.failed")
                  : t("payments.status.awaiting")}
              </Badge>
            </div>
            <div className="text-xs text-muted-foreground">
              {formatPayDate(row.createdAt, locale, "short")}
            </div>
            {row.payUrl ? <PayLink url={row.payUrl} className="bg-background" /> : null}
          </li>
        ))}
      </ul>

      <div className="hidden overflow-hidden rounded-lg border sm:block">
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
                    {flexRender(header.column.columnDef.header, header.getContext())}
                    {{ asc: " ↑", desc: " ↓" }[header.column.getIsSorted() as string] ?? ""}
                  </TableHead>
                ))}
                <TableHead className="px-4 text-xs text-muted-foreground">
                  {t("payments.col.link")}
                </TableHead>
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows.map((row) => (
              <TableRow key={row.id}>
                {row.getVisibleCells().map((cell) => (
                  <TableCell key={cell.id} className="px-4">
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </TableCell>
                ))}
                <TableCell className="w-auto px-4 lg:w-72 lg:max-w-72">
                  {row.original.payUrl ? (
                    <PayLink url={row.original.payUrl} className="bg-background" collapseUrlBelowLg />
                  ) : (
                    <span className="text-sm text-muted-foreground">—</span>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
