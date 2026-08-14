"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronRight, Search } from "lucide-react";
import { formatMinorAmount } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { payDateFormatter } from "@/lib/format-date";
import { usePayLocale, useT } from "@/lib/locales/context";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { AddCustomer, type NewCustomer } from "./add-customer.client";
import { CustomersTableSkeleton } from "./customers-skeleton";

type CustomerRow = NewCustomer;

/** The three states a merchant sorts people into, in priority order. */
type Bucket = "attention" | "active" | "none";
/**
 * `guests` is not a fourth bucket — it selects a different list.
 *
 * Stripe keeps guests on their own tab because they are not people you can act
 * on: a one-off payer with no saved card, grouped read-only so you can see that
 * four payments came from the same person. Folding them into "all" would make
 * the count on the page a number the merchant cannot bill against.
 */
type Tab = "all" | Bucket | "guests";

/**
 * Exactly one bucket per customer, so the tab counts add up to the total and a
 * merchant can trust them.
 *
 * Someone who is both paying and behind lands in "needs action", not both: the
 * overdue subscription is the one that requires them to do something today, and
 * a row that appears under two tabs makes every count a question.
 */
function bucketOf(row: CustomerRow): Bucket {
  if (row.attention_count > 0) return "attention";
  if (row.active_count > 0) return "active";
  return "none";
}

/**
 * The name is what a merchant recognises — «мама Алишера», not an inbox. Email
 * and phone are only fallbacks, for rows created before there was a name to
 * store and for API callers that do not send one.
 */
function displayName(row: CustomerRow) {
  return row.name ?? row.email ?? row.phone ?? null;
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
  const t = useT();
  // The browser's locale, not the merchant's, used to date this column — so a
  // fully Russian page still said "Aug 14, 2026".
  const fmtDate = payDateFormatter(usePayLocale());
  const router = useRouter();
  const [rows, setRows] = useState<CustomerRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [tab, setTab] = useState<Tab>("all");

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

  const counts = useMemo(() => {
    const tally = { all: 0, attention: 0, active: 0, none: 0, guests: 0 };
    for (const row of rows ?? []) {
      if (row.is_guest) {
        tally.guests += 1;
        continue;
      }
      tally.all += 1;
      tally[bucketOf(row)] += 1;
    }
    return tally;
  }, [rows]);

  // Tabs appear only when they can actually split the list. With every customer
  // in one bucket they are four controls that all show the same rows — the
  // total restated three times over. Any guests at all are worth a tab, because
  // otherwise there is no way to see them.
  const showTabs =
    [counts.attention, counts.active, counts.none].filter((n) => n > 0).length > 1 ||
    counts.guests > 0;
  // Search earns its place once the list is long enough to scroll past; below
  // that it is chrome, so it only appears at a real threshold.
  const showSearch = counts.all + counts.guests > 8;

  // Derived, not stored: paying off the last overdue invoice can collapse the
  // tabs while "needs action" is selected, and a filter the merchant can no
  // longer see must not keep hiding rows from them.
  const activeTab: Tab = showTabs ? tab : "all";

  const filtered = useMemo(() => {
    if (!rows) return null;
    const q = query.trim().toLowerCase();
    return rows.filter((row) => {
      // Guests are a separate list, not a slice of this one. Every other tab
      // means "customers I can bill", which a guest is not.
      if (activeTab === "guests") {
        if (!row.is_guest) return false;
      } else {
        if (row.is_guest) return false;
        if (activeTab !== "all" && bucketOf(row) !== activeTab) return false;
      }
      if (!q) return true;
      return [row.name, row.email, row.phone, row.external_id]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q));
    });
  }, [rows, query, activeTab]);

  const onAdded = useCallback((customer: NewCustomer) => {
    // Prepended rather than refetched: the list is ordered newest first, and a
    // customer created one statement ago provably has no subscriptions, so
    // there is nothing a round trip could tell us that we do not already know.
    setRows((current) => [customer, ...(current ?? [])]);
    setQuery("");
    setTab("all");
  }, []);

  const open = useCallback(
    (row: CustomerRow) => {
      router.push(`/dashboard/org/${orgSlug}/customers/${row.id}`);
    },
    [router, orgSlug],
  );

  function body() {
    if (error) {
      return (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </div>
      );
    }

    // The same table the route skeleton drew a moment ago, not a one-line
    // "loading" box — otherwise the page renders a table, collapses to a strip
    // while this fetch runs, then expands into a table again.
    if (rows === null) return <CustomersTableSkeleton />;

    if (rows.length === 0) {
      return (
        <div className="rounded-lg border p-6 text-sm text-muted-foreground">
          <p>{t("customers.empty")}</p>
          <p className="mt-1">{t("customers.empty.hint")}</p>
        </div>
      );
    }

    return (
      <div className="space-y-2">
        {/* Says what a guest is, where the merchant meets one. Without it, a
            row you cannot bill and cannot rename looks like a broken customer
            rather than a deliberately different kind of record. */}
        {activeTab === "guests" ? (
          <p className="text-xs text-muted-foreground">{t("customers.guests.hint")}</p>
        ) : null}

      <div className="overflow-hidden rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/40 hover:bg-muted/40">
              <TableHead className="px-4 text-xs text-muted-foreground">
                {t("customers.col.customer")}
              </TableHead>
              <TableHead className="text-xs text-muted-foreground">
                {t("customers.col.subscriptions")}
              </TableHead>
              <TableHead className="text-right text-xs text-muted-foreground">
                {t("customers.col.monthly")}
              </TableHead>
              <TableHead className="text-xs text-muted-foreground">
                {t("customers.col.created")}
              </TableHead>
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
                  {t("customers.noMatch")}
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
                  <span className="flex items-center">
                    <span className="min-w-0">
                      <span className="block truncate">
                        {displayName(row) ?? (
                          <span className="text-muted-foreground italic">
                            {t("customer.unnamed")}
                          </span>
                        )}
                      </span>
                      {row.name && row.email ? (
                        <span className="block truncate text-xs font-normal text-muted-foreground">
                          {row.email}
                        </span>
                      ) : null}
                      {row.external_id ? (
                        <span
                          className="block truncate font-mono text-xs font-normal text-muted-foreground"
                          title={row.external_id}
                        >
                          {row.external_id.length > 14
                            ? `${row.external_id.slice(0, 8)}…${row.external_id.slice(-4)}`
                            : row.external_id}
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
                        <Badge variant="success">
                          {t("customers.badge.active", { count: row.active_count })}
                        </Badge>
                      ) : null}
                      {/* The only reason a merchant opens this page in a hurry:
                          somebody owes them money. It gets its own pill. */}
                      {row.attention_count > 0 ? (
                        <Badge variant="warning">
                          {t("customers.badge.attention", { count: row.attention_count })}
                        </Badge>
                      ) : null}
                      {row.active_count === 0 && row.attention_count === 0 ? (
                        <span className="text-sm text-muted-foreground">
                          {t("customers.badge.inactive", { count: row.subscription_count })}
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
                  <span className="sr-only">{t("customers.open")}</span>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* The toolbar renders in every state, empty list included — "add a
          customer" is most needed by the merchant who has none. */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        {showTabs ? (
          /* Four Russian labels with counts are wider than a phone. The strip
             scrolls rather than wrapping, so the tabs stay one row of controls
             instead of becoming a two-line block above the list. */
          <Tabs
            value={activeTab}
            onValueChange={(v) => setTab(v as Tab)}
            className="max-w-full overflow-x-auto"
          >
            <TabsList>
              <TabsTrigger value="all">
                {t("customers.tab.all")}
                <Badge variant="secondary" className="ml-1.5 tabular-nums">
                  {counts.all}
                </Badge>
              </TabsTrigger>
              <TabsTrigger value="active">
                {t("customers.tab.active")}
                <Badge variant="secondary" className="ml-1.5 tabular-nums">
                  {counts.active}
                </Badge>
              </TabsTrigger>
              <TabsTrigger value="attention">
                {t("customers.tab.attention")}
                <Badge variant="secondary" className="ml-1.5 tabular-nums">
                  {counts.attention}
                </Badge>
              </TabsTrigger>
              <TabsTrigger value="none">
                {t("customers.tab.none")}
                <Badge variant="secondary" className="ml-1.5 tabular-nums">
                  {counts.none}
                </Badge>
              </TabsTrigger>
              {/* Last, and only when there are any — it is a different list,
                  not another way of slicing the four to its left. */}
              {counts.guests > 0 ? (
                <TabsTrigger value="guests">
                  {t("customers.tab.guests")}
                  <Badge variant="secondary" className="ml-1.5 tabular-nums">
                    {counts.guests}
                  </Badge>
                </TabsTrigger>
              ) : null}
            </TabsList>
          </Tabs>
        ) : (
          <div />
        )}

        <div className="flex items-center gap-2">
          {showSearch ? (
            <div className="relative w-full sm:w-64">
              <Search
                aria-hidden
                className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
              />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t("customers.search")}
                className="h-8 pl-8"
                aria-label={t("customers.search")}
              />
            </div>
          ) : null}

          <AddCustomer orgSlug={orgSlug} environment={environment} onAdded={onAdded} />
        </div>
      </div>

      {body()}
    </div>
  );
}
