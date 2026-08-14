"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronRight, Search } from "lucide-react";
import { formatMinorAmount } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { DitherAvatar } from "@/components/dither-kit/avatar";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type CustomerRow = {
  id: string;
  email: string | null;
  phone: string | null;
  external_id: string | null;
  environment: string | null;
  created_at: string | null;
  subscription_count: number;
  active_count: number;
  attention_count: number;
  mrr_minor: number | null;
  mrr_currency: string | null;
};

function fmtDate(value?: string | null) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

/**
 * The avatar seed.
 *
 * Deliberately the customer id, not the display name: an email can be edited
 * and a phone can be reassigned, and either would silently change the mark a
 * merchant has learned to recognise. The id never moves.
 */
function avatarSeed(row: { id: string }) {
  return row.id;
}

/** Email is the identity the merchant recognises; phone is the fallback. */
function displayName(row: CustomerRow) {
  return row.email ?? row.phone ?? "—";
}

export function CustomersListClient({
  orgId,
  orgSlug,
  environment,
}: {
  orgId: string;
  orgSlug: string;
  environment: string;
}) {
  const router = useRouter();
  const [rows, setRows] = useState<CustomerRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  useEffect(() => {
    if (!orgId) return;
    let ignore = false;
    const run = async () => {
      try {
        const res = await fetch(
          `/api/dashboard/customers?orgId=${encodeURIComponent(orgId)}&environment=${encodeURIComponent(environment)}`,
          { cache: "no-store" },
        );
        const json = (await res.json().catch(() => null)) as
          | { customers?: CustomerRow[]; error?: string }
          | null;
        if (!res.ok) {
          throw new Error(json?.error ?? `http_${res.status}`);
        }
        if (ignore) return;
        setRows(json?.customers ?? []);
        setError(null);
      } catch (e) {
        if (ignore) return;
        setRows([]);
        setError(e instanceof Error ? e.message : String(e));
      }
    };
    void run();

    return () => {
      ignore = true;
    };
  }, [orgId, environment]);

  const filtered = useMemo(() => {
    if (!rows) return null;
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((row) =>
      [row.email, row.phone, row.external_id]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q)),
    );
  }, [rows, query]);

  if (error) {
    return (
      <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
        {error}
      </div>
    );
  }

  if (rows === null) {
    return (
      <div className="rounded-lg border p-6 text-sm text-muted-foreground">
        Loading customers…
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div className="rounded-lg border p-6 text-sm text-muted-foreground">
        No customers yet. A customer is created the first time you start a
        subscription for them.
      </div>
    );
  }

  function open(row: CustomerRow) {
    router.push(`/dashboard/org/${orgSlug}/customers/${row.id}`);
  }

  return (
    <div className="space-y-3">
      {/* Search earns its place once the list is long enough to scroll past;
          below that it is chrome, so it only appears at a real threshold. */}
      {rows.length > 8 ? (
        <div className="relative max-w-xs">
          <Search
            aria-hidden
            className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search email, phone, ID"
            className="pl-8"
            aria-label="Search customers"
          />
        </div>
      ) : null}

      <div className="overflow-hidden rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/40 hover:bg-muted/40">
              <TableHead className="px-4 text-xs text-muted-foreground">
                Customer
              </TableHead>
              <TableHead className="text-xs text-muted-foreground">
                Subscriptions
              </TableHead>
              <TableHead className="text-right text-xs text-muted-foreground">
                Monthly
              </TableHead>
              <TableHead className="text-xs text-muted-foreground">Created</TableHead>
              <TableHead className="w-0 px-4" />
            </TableRow>
          </TableHeader>

          <TableBody>
            {filtered && filtered.length === 0 ? (
              <TableRow className="hover:bg-transparent">
                <TableCell
                  colSpan={5}
                  className="px-4 py-6 text-sm text-muted-foreground"
                >
                  No customers match “{query}”.
                </TableCell>
              </TableRow>
            ) : null}

            {(filtered ?? []).map((row) => (
              <TableRow
                key={row.id}
                className="cursor-pointer focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring"
                role="button"
                tabIndex={0}
                onClick={() => open(row)}
                onKeyDown={(e) => {
                  if (e.key !== "Enter" && e.key !== " ") return;
                  e.preventDefault();
                  open(row);
                }}
              >
                <TableCell className="px-4 font-medium">
                  <span className="flex items-center gap-2.5">
                    {/* Generated from the identity itself, so the same parent
                        is the same mark on every screen and after every reload.
                        Nobody uploads anything, and a list of forty rows of
                        near-identical email addresses becomes scannable. */}
                    <DitherAvatar
                      name={avatarSeed(row)}
                      className="size-6 shrink-0 rounded-md"
                    />
                    <span className="min-w-0">
                      <span className="block truncate">{displayName(row)}</span>
                      {row.external_id ? (
                        <span className="block truncate font-mono text-xs font-normal text-muted-foreground">
                          {row.external_id}
                        </span>
                      ) : null}
                    </span>
                  </span>
                </TableCell>

                <TableCell>
                  {row.subscription_count === 0 ? (
                    <span className="text-muted-foreground">—</span>
                  ) : (
                    <span className="flex flex-wrap items-center gap-2">
                      {row.active_count > 0 ? (
                        <Badge variant="success">{row.active_count} active</Badge>
                      ) : null}
                      {/* The only reason a merchant opens this page in a hurry:
                          somebody owes them money. It gets its own pill. */}
                      {row.attention_count > 0 ? (
                        <Badge variant="warning">
                          {row.attention_count} needs action
                        </Badge>
                      ) : null}
                      {row.active_count === 0 && row.attention_count === 0 ? (
                        <span className="text-sm text-muted-foreground">
                          {row.subscription_count} inactive
                        </span>
                      ) : null}
                    </span>
                  )}
                </TableCell>

                <TableCell className="text-right tabular-nums">
                  {row.mrr_minor && row.mrr_currency ? (
                    formatMinorAmount(row.mrr_minor, row.mrr_currency)
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </TableCell>

                <TableCell className="text-muted-foreground">
                  {fmtDate(row.created_at)}
                </TableCell>

                <TableCell className="px-4">
                  <ChevronRight aria-hidden className="size-4 text-muted-foreground" />
                  <span className="sr-only">Open customer</span>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
