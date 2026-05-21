"use client";

import * as React from "react";

import { createClient } from "@/lib/supabase/client";
import { pinRealtimeAuth } from "@/lib/supabase/realtime";

/**
 * Translation workbench realtime hook.
 *
 * Subscribes to live postgres_changes events on two tables and exposes:
 *   - activeJobs        — translation_jobs currently `queued` or
 *                          `processing` for this catalog. Drives the
 *                          "AI translating into X…" pulse in the
 *                          panel header.
 *   - recentlyUpdated   — Set of item IDs whose translations changed
 *                          within the last `highlightMs` ms. Drives
 *                          the soft amber row highlight in the Items
 *                          tab. Items auto-expire individually so the
 *                          set self-cleans without a global timer race.
 *   - hasActivity       — convenience boolean, true when at least one
 *                          job is queued or processing.
 *
 * Side effect: calls `onTranslationChange` (debounced) when an
 * `item_translations` row changes. The panel uses this to
 * `router.refresh()` so the RSC payload — and therefore the
 * percentage / per-language counts — stays in sync with the wire.
 *
 * Filtering strategy:
 *   - `translation_jobs` carries `catalog_id` directly, so Realtime's
 *      server-side filter does the work.
 *   - `item_translations` doesn't (it links via item_id → items →
 *      catalog_id). We subscribe unfiltered and intersect against the
 *      `itemIds` set on the client. RLS already limits the stream to
 *      the user's accessible catalogs; the client filter then scopes
 *      to *this* catalog.
 *
 * RLS auth: `pinRealtimeAuth` is called before subscribing so the
 * channel evaluates RLS against the merchant's JWT rather than the
 * anon role. Without it, the channel reports SUBSCRIBED but no rows
 * make it through any policy that requires authenticated identity.
 */

export type ActiveJob = {
  id: string;
  targetLocale: string;
  /**
   * Schema enum is `queued | running | done | skipped | failed | dead`.
   * We track the two in-flight states only — terminal states get
   * pruned from `activeJobs` so the pulse copy reads as "happening
   * right now".
   */
  status: "queued" | "running";
};

export type UseTranslationRealtimeOptions = {
  catalogId: string;
  /** Item IDs in this catalog. Used to filter item_translations
   *  events client-side since the table has no direct catalog_id. */
  itemIds: ReadonlySet<string>;
  /** Called (debounced ~250ms) when an item_translations row inserts
   *  or updates. Typically wired to router.refresh(). */
  onTranslationChange?: () => void;
  /** How long an item stays in `recentlyUpdated` after its
   *  translation lands. Defaults to 2.5 seconds — enough for the
   *  merchant to register the highlight, short enough that
   *  long-running bulk jobs don't paint the whole table amber. */
  highlightMs?: number;
};

export type UseTranslationRealtimeResult = {
  activeJobs: ActiveJob[];
  recentlyUpdated: ReadonlySet<string>;
  hasActivity: boolean;
};

const DEBOUNCE_MS = 250;

/**
 * Diagnostic logging gate. Set `localStorage.kraftaRealtimeDebug = "1"` in
 * the browser to enable verbose console output. Off by default so prod
 * builds don't leak debug noise. Toggle for a session via the devtools
 * console:
 *
 *   localStorage.kraftaRealtimeDebug = "1"
 *   location.reload()
 *
 * Then watch the console for `[translations-realtime]` lines: channel
 * status, event payloads, backfill results. Clear with:
 *
 *   localStorage.removeItem("kraftaRealtimeDebug")
 */
function debug(...args: unknown[]): void {
  if (typeof window === "undefined") return;
  try {
    if (window.localStorage.getItem("kraftaRealtimeDebug") === "1") {
      // eslint-disable-next-line no-console
      console.log("[translations-realtime]", ...args);
    }
  } catch {
    // localStorage unavailable (private mode, sandbox) — silently skip.
  }
}

export function useTranslationRealtime(
  options: UseTranslationRealtimeOptions,
): UseTranslationRealtimeResult {
  const { catalogId, itemIds, onTranslationChange, highlightMs = 2500 } =
    options;

  const [activeJobs, setActiveJobs] = React.useState<ActiveJob[]>([]);
  const [recentlyUpdated, setRecentlyUpdated] = React.useState<Set<string>>(
    () => new Set(),
  );

  // Keep the latest itemIds + onTranslationChange in refs so the
  // subscribe effect doesn't tear down + resubscribe every render.
  // The channel lifecycle should track catalogId only.
  const itemIdsRef = React.useRef(itemIds);
  itemIdsRef.current = itemIds;
  const onChangeRef = React.useRef(onTranslationChange);
  onChangeRef.current = onTranslationChange;

  React.useEffect(() => {
    let cancelled = false;
    const supabase = createClient();
    const channelName = `kra92:translations:${catalogId}`;

    // Debounced fan-out: collapse rapid bursts of updates into a
    // single refresh so router.refresh isn't called once per row
    // during a 200-row bulk translate.
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;
    const triggerOnChange = () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        onChangeRef.current?.();
      }, DEBOUNCE_MS);
    };

    // Per-item expiry timers — each highlighted row clears itself
    // after `highlightMs`. Using a Map<id, timeoutId> rather than a
    // global timer keeps the rendering tight even if updates arrive
    // staggered. Cleared on unmount.
    const expiryTimers = new Map<string, ReturnType<typeof setTimeout>>();
    const markRecent = (itemId: string) => {
      setRecentlyUpdated((prev) => {
        const next = new Set(prev);
        next.add(itemId);
        return next;
      });
      const existing = expiryTimers.get(itemId);
      if (existing) clearTimeout(existing);
      const t = setTimeout(() => {
        if (cancelled) return;
        setRecentlyUpdated((prev) => {
          if (!prev.has(itemId)) return prev;
          const next = new Set(prev);
          next.delete(itemId);
          return next;
        });
        expiryTimers.delete(itemId);
      }, highlightMs);
      expiryTimers.set(itemId, t);
    };

    // Supabase's postgres_changes payload comes through as
    // `Record<string, any>` because the channel isn't generic-typed by
    // the runtime. We treat each row as `unknown` then narrow with a
    // local cast — the worker is the only writer to these columns and
    // its TypeScript file is the canonical schema reference.
    const handleJobChange = (payload: {
      eventType: "INSERT" | "UPDATE" | "DELETE";
      new: Record<string, unknown>;
      old: Record<string, unknown>;
    }) => {
      debug("translation_jobs event", payload.eventType, payload.new ?? payload.old);
      if (payload.eventType === "DELETE") {
        const id = (payload.old.id as string | undefined) ?? null;
        if (!id) return;
        setActiveJobs((prev) => prev.filter((j) => j.id !== id));
        return;
      }
      const row = payload.new as RawTranslationJob;
      // Only track jobs in-flight. Terminal states (done / skipped /
      // failed / dead) get pruned so activeJobs reads as "happening
      // right now."
      if (row.status === "queued" || row.status === "running") {
        const next: ActiveJob = {
          id: row.id,
          targetLocale: row.target_locale,
          status: row.status,
        };
        setActiveJobs((prev) => {
          const idx = prev.findIndex((j) => j.id === next.id);
          if (idx === -1) return [...prev, next];
          const copy = prev.slice();
          copy[idx] = next;
          return copy;
        });
      } else {
        setActiveJobs((prev) => prev.filter((j) => j.id !== row.id));
      }
    };

    const handleTranslationChange = (payload: {
      eventType: "INSERT" | "UPDATE" | "DELETE";
      new: Record<string, unknown>;
      old: Record<string, unknown>;
    }) => {
      debug(
        "item_translations event",
        payload.eventType,
        payload.new ?? payload.old,
      );
      const source =
        payload.eventType === "DELETE" ? payload.old : payload.new;
      const itemId = source.item_id as string | undefined;
      if (!itemId) {
        debug("item_translations event skipped — no item_id on payload");
        return;
      }
      // Filter to this catalog's items. RLS already limits the
      // stream to the user's accessible catalogs; this scopes to
      // the one being viewed.
      if (!itemIdsRef.current.has(itemId)) return;
      if (payload.eventType !== "DELETE") {
        markRecent(itemId);
      }
      triggerOnChange();
    };

    const subscribe = async () => {
      debug("setting up channel", channelName);
      // Make sure the merchant's JWT is set on the realtime socket
      // before subscribing. See pinRealtimeAuth header comment.
      await pinRealtimeAuth(supabase);
      if (cancelled) return;
      debug("pinRealtimeAuth done, subscribing…");

      // The Realtime client lib's postgres_changes filter signature is
      // narrow to the literal "*" / specific events but the channel
      // method type stays loose; cast to a permissive shape on the
      // way in so the handler keeps its strict types.
      type RealtimePayload = Parameters<typeof handleJobChange>[0];
      const channel = supabase
        .channel(channelName)
        .on(
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          "postgres_changes" as any,
          {
            event: "*",
            schema: "public",
            table: "translation_jobs",
            filter: `catalog_id=eq.${catalogId}`,
          },
          (payload: RealtimePayload) => handleJobChange(payload),
        )
        .on(
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          "postgres_changes" as any,
          {
            event: "*",
            schema: "public",
            table: "item_translations",
          },
          (payload: RealtimePayload) => handleTranslationChange(payload),
        )
        .subscribe((status, err) => {
          // status: SUBSCRIBED | TIMED_OUT | CLOSED | CHANNEL_ERROR
          // The most common silent failure is the publication not
          // including the table — channel shows SUBSCRIBED but
          // postgres_changes events never fire. The realtime DB
          // migration (20260521060000) must have applied for this
          // to work. To verify:
          //   SELECT * FROM pg_publication_tables
          //   WHERE pubname = 'supabase_realtime'
          //   AND tablename IN ('item_translations','translation_jobs');
          debug("channel status →", status, err ? `err=${err.message}` : "");
        });

      // Backfill: pull jobs already in-flight when the user landed on
      // the page. Without this, refreshing mid-translation would show
      // "no AI activity" until the next job transitioned.
      const { data: existing, error: backfillErr } = await supabase
        .from("translation_jobs")
        .select("id, target_locale, status")
        .eq("catalog_id", catalogId)
        .in("status", ["queued", "running"]);
      debug(
        "backfill result",
        backfillErr ? `error=${backfillErr.message}` : `rows=${existing?.length ?? 0}`,
        existing,
      );
      if (!cancelled && existing) {
        setActiveJobs(
          existing.map((row) => ({
            id: row.id,
            targetLocale: row.target_locale,
            status: row.status as "queued" | "running",
          })),
        );
      }

      return channel;
    };

    const channelPromise = subscribe();

    return () => {
      cancelled = true;
      if (debounceTimer) clearTimeout(debounceTimer);
      for (const t of expiryTimers.values()) clearTimeout(t);
      expiryTimers.clear();
      void channelPromise.then((ch) => {
        if (ch) supabase.removeChannel(ch);
      });
    };
  }, [catalogId, highlightMs]);

  const hasActivity = activeJobs.length > 0;

  return { activeJobs, recentlyUpdated, hasActivity };
}

// ============================================================================
// Raw row shapes — what postgres_changes emits before our normalisation.
// Kept as a separate type so the handler signatures stay narrow without
// importing the generated Database types (which would couple this hook
// to the typegen file).
// ============================================================================

type RawTranslationJob = {
  id: string;
  target_locale: string;
  /** Public enum: queued | running | done | skipped | failed | dead. */
  status: "queued" | "running" | "done" | "skipped" | "failed" | "dead";
};
