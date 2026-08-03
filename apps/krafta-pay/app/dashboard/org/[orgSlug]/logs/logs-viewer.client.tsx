"use client";

import { useEffect, useMemo, useState } from "react";

type RecentCheckout = {
  id: string;
  public_token: string;
  payment_intent_id: string | null;
  created_at: string;
};

type LogRow = {
  id: number;
  created_at: string;
  environment: string | null;
  type: string;
  event: string;
  level: string;
  provider_id: string | null;
  org_id: string | null;
  checkout_session_id: string | null;
  payment_intent_id: string | null;
  payment_attempt_id: string | null;
  public_token: string | null;
  data: unknown;
};

type LogsResponse = {
  logs?: LogRow[];
  recentCheckouts?: RecentCheckout[];
  error?: string;
};

function fmtDateTime(value?: string | null) {
  if (!value) return "n/a";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString();
}

function prettyJson(value: unknown) {
  try {
    return JSON.stringify(value ?? {}, null, 2);
  } catch {
    return String(value);
  }
}

const LOG_TYPE_OPTIONS = ["", "checkout_api", "uzum", "webhook", "callback_page", "cron"] as const;

export function LogsViewerClient({
  orgId,
  initialPublicToken,
  initialType,
}: {
  orgId: string;
  initialPublicToken?: string;
  initialType?: string;
}) {
  const [publicToken, setPublicToken] = useState(initialPublicToken ?? "");
  const [type, setType] = useState(initialType ?? "");
  const [providerId, setProviderId] = useState("");
  const [rows, setRows] = useState<LogRow[] | null>(null);
  const [recentCheckouts, setRecentCheckouts] = useState<RecentCheckout[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!orgId) return;
    let ignore = false;

    const run = async () => {
      try {
        const params = new URLSearchParams({ orgId, limit: "200" });
        if (publicToken.trim()) params.set("publicToken", publicToken.trim());
        if (type.trim()) params.set("type", type.trim());
        if (providerId.trim()) params.set("providerId", providerId.trim());

        const res = await fetch(`/api/dashboard/logs?${params.toString()}`, {
          cache: "no-store",
        });
        const json = (await res.json().catch(() => null)) as LogsResponse | null;
        if (!res.ok) throw new Error(json?.error ?? `http_${res.status}`);
        if (ignore) return;

        setRows(json?.logs ?? []);
        setRecentCheckouts(json?.recentCheckouts ?? []);
        setError(null);
      } catch (e) {
        if (ignore) return;
        setRows([]);
        setRecentCheckouts([]);
        setError(e instanceof Error ? e.message : String(e));
      }
    };

    void run();
    return () => {
      ignore = true;
    };
  }, [orgId, publicToken, type, providerId]);

  const groupedByToken = useMemo(() => {
    const map = new Map<string, number>();
    for (const row of rows ?? []) {
      const token = row.public_token ?? "no-token";
      map.set(token, (map.get(token) ?? 0) + 1);
    }
    return Array.from(map.entries()).sort((a, b) => b[1] - a[1]);
  }, [rows]);

  return (
    <div className="space-y-6">
      <div className="rounded-md border bg-background p-4">
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <label className="text-sm font-medium" htmlFor="logs-type">
              Log type
            </label>
            <select
              id="logs-type"
              className="mt-2 h-10 w-full rounded-md border bg-background px-3 text-base md:text-sm"
              value={type}
              onChange={(e) => setType(e.target.value)}
            >
              {LOG_TYPE_OPTIONS.map((option) => (
                <option key={option || "all"} value={option}>
                  {option || "All types"}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-sm font-medium" htmlFor="logs-public-token">
              Public token (optional)
            </label>
            <input
              id="logs-public-token"
              className="mt-2 h-10 w-full rounded-md border bg-background px-3 text-base md:text-sm"
              placeholder="Paste checkout public token"
              value={publicToken}
              onChange={(e) => setPublicToken(e.target.value)}
            />
          </div>

          <div>
            <label className="text-sm font-medium" htmlFor="logs-provider">
              Provider ID (optional)
            </label>
            <input
              id="logs-provider"
              className="mt-2 h-10 w-full rounded-md border bg-background px-3 text-base md:text-sm"
              placeholder="uzum"
              value={providerId}
              onChange={(e) => setProviderId(e.target.value)}
            />
          </div>
        </div>

        <p className="mt-3 text-xs text-muted-foreground">
          Logs are org-scoped. Sensitive provider credentials are not stored in logs.
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.2fr,2fr]">
        <div className="rounded-md border bg-background p-4">
          <h2 className="text-sm font-medium">Recent checkouts</h2>
          {recentCheckouts.length === 0 ? (
            <p className="mt-3 text-sm text-muted-foreground">No recent checkouts found.</p>
          ) : (
            <div className="mt-3 space-y-2">
              {recentCheckouts.map((checkout) => (
                <button
                  key={checkout.id}
                  type="button"
                  className="w-full rounded-md border bg-background p-2 text-left hover:bg-muted/40"
                  onClick={() => setPublicToken(checkout.public_token)}
                >
                  <p className="truncate font-mono text-xs">{checkout.public_token}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {fmtDateTime(checkout.created_at)}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    intent: {checkout.payment_intent_id ?? "n/a"}
                  </p>
                </button>
              ))}
            </div>
          )}

          <div className="mt-4 rounded-md border bg-muted/10 p-3">
            <p className="text-xs font-medium">Log count by token (current result)</p>
            {groupedByToken.length === 0 ? (
              <p className="mt-2 text-xs text-muted-foreground">No log rows loaded.</p>
            ) : (
              <div className="mt-2 space-y-1">
                {groupedByToken.slice(0, 8).map(([token, count]) => (
                  <p key={token} className="truncate text-xs text-muted-foreground">
                    {token}: {count}
                  </p>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="rounded-md border bg-background p-4">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-sm font-medium">Logs</h2>
            <div className="text-xs text-muted-foreground">
              {rows === null ? "Loading..." : `${rows.length} row${rows.length === 1 ? "" : "s"}`}
            </div>
          </div>

          {rows === null ? (
            <p className="mt-3 text-sm text-muted-foreground">Loading logs...</p>
          ) : rows.length === 0 ? (
            <p className="mt-3 text-sm text-muted-foreground">
              No logs found for the current filters.
            </p>
          ) : (
            <div className="mt-3 space-y-3">
              {rows.map((row) => (
                <details key={row.id} className="rounded-md border bg-background p-3">
                  <summary className="cursor-pointer list-none">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-medium">
                          {row.type}.{row.event}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {fmtDateTime(row.created_at)} · {row.level}
                          {row.environment ? ` · ${row.environment}` : ""}
                          {row.provider_id ? ` · ${row.provider_id}` : ""}
                        </p>
                        <p className="truncate text-xs text-muted-foreground">
                          token: {row.public_token ?? "n/a"}
                        </p>
                      </div>
                      <div className="text-right text-xs text-muted-foreground">
                        <p>intent: {row.payment_intent_id ?? "n/a"}</p>
                        <p>attempt: {row.payment_attempt_id ?? "n/a"}</p>
                      </div>
                    </div>
                  </summary>

                  <div className="mt-3 space-y-2">
                    <div className="grid gap-2 sm:grid-cols-2">
                      <div className="rounded-md border bg-muted/10 p-2">
                        <p className="text-xs font-medium">Checkout session</p>
                        <p className="mt-1 break-all text-xs text-muted-foreground">
                          {row.checkout_session_id ?? "n/a"}
                        </p>
                      </div>
                      <div className="rounded-md border bg-muted/10 p-2">
                        <p className="text-xs font-medium">Org ID</p>
                        <p className="mt-1 break-all text-xs text-muted-foreground">
                          {row.org_id ?? "n/a"}
                        </p>
                      </div>
                    </div>
                    <div className="rounded-md border bg-black p-3 dark:bg-zinc-950">
                      <p className="mb-2 text-xs font-medium text-zinc-200">Payload</p>
                      <pre className="max-h-96 overflow-auto whitespace-pre-wrap break-words text-xs text-zinc-300">
                        {prettyJson(row.data)}
                      </pre>
                    </div>
                  </div>
                </details>
              ))}
            </div>
          )}
        </div>
      </div>

      {error ? (
        <div className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </div>
      ) : null}
    </div>
  );
}
