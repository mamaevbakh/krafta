"use client";

/**
 * Merchant QR-codes panel.
 *
 * Top: three "mode" cards (Main / Pickup / Delivery).
 *   - Main is always enabled.
 *   - Pickup + Delivery cards show a "Enable …" toggle when the mode
 *     isn't in venues.modes_enabled. Toggling on flips the venue's
 *     modes_enabled array — the existing QR row stays, the card
 *     simply un-greys.
 *
 * Bottom: tables list.
 *   - "Add table" inline form (Enter to submit).
 *   - Each row: label (inline-editable), active toggle, QR preview,
 *     Download PNG, Regenerate, Delete.
 *   - "Download all table QRs (.zip)" → /api/qr-codes/zip/[venueId].
 *
 * Server already pre-renders SVGs for every QR; client only rasterizes
 * to PNG on Download click via an in-memory <canvas>.
 */

import * as React from "react";
import { startTransition, useTransition } from "react";
import { toast } from "sonner";
import { Download, Loader2, Plus, RefreshCw, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";

import {
  createTable,
  deleteTable,
  regenerateQrShortcode,
  setVenueModes,
  updateTable,
} from "@/lib/tables/actions";

type ModeQr = {
  kind: "main" | "pickup" | "delivery";
  qrId: string;
  shortcode: string;
  url: string;
  svg: string;
  isActive: boolean;
};

type TableRow = {
  id: string;
  label: string;
  position: number;
  isActive: boolean;
  qrId: string | null;
  shortcode: string;
  url: string;
  svg: string | null;
};

type QrCodesPanelProps = {
  catalogId: string;
  catalogName: string;
  catalogSlug: string;
  venueId: string;
  venueName: string;
  modesEnabled: string[];
  modeQrs: ModeQr[];
  tables: TableRow[];
};

export function QrCodesPanel({
  catalogName,
  catalogSlug,
  venueId,
  venueName,
  modesEnabled,
  modeQrs,
  tables,
}: QrCodesPanelProps) {
  const modeQrByKind = React.useMemo(() => {
    const map: Partial<Record<ModeQr["kind"], ModeQr>> = {};
    for (const qr of modeQrs) map[qr.kind] = qr;
    return map;
  }, [modeQrs]);

  return (
    <div className="mx-auto flex max-w-[1200px] flex-col gap-8 px-6 py-8">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">QR codes</h1>
        <p className="text-sm text-muted-foreground">
          Printable codes for{" "}
          <span className="font-medium text-foreground">{catalogName}</span>.
          Customers scan → land in the right ordering mode.
        </p>
      </header>

      <section className="flex flex-col gap-4">
        <h2 className="text-sm font-medium uppercase tracking-[0.12em] text-muted-foreground">
          Mode QRs
        </h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {(["main", "pickup", "delivery"] as const).map((kind) => {
            const qr = modeQrByKind[kind];
            if (!qr) return null;
            const isModeEnabled =
              kind === "main" ||
              modesEnabled.includes(kind === "pickup" ? "pickup" : "delivery");
            return (
              <ModeQrCard
                key={kind}
                qr={qr}
                isModeEnabled={isModeEnabled}
                venueId={venueId}
                catalogSlug={catalogSlug}
                modesEnabled={modesEnabled}
                catalogSubtitle={venueName}
              />
            );
          })}
        </div>
      </section>

      <section className="flex flex-col gap-4">
        <div className="flex items-end justify-between gap-3">
          <div>
            <h2 className="text-sm font-medium uppercase tracking-[0.12em] text-muted-foreground">
              Tables
            </h2>
            <p className="mt-1 text-xs text-muted-foreground">
              One QR per dine-in surface. Add them as you set up the room
              (Table 1, Bar 2, Patio A …).
            </p>
          </div>
          {tables.length > 0 ? (
            <Button
              variant="outline"
              size="sm"
              asChild
              className="gap-1.5"
            >
              <a
                href={`/api/qr-codes/zip/${venueId}`}
                download={`${catalogSlug}-tables-qrs.zip`}
              >
                <Download className="size-3.5" aria-hidden />
                Download all (.zip)
              </a>
            </Button>
          ) : null}
        </div>

        <AddTableForm
          venueId={venueId}
          catalogSlug={catalogSlug}
          // Disable while there's no obvious next label suggestion needed
          existingCount={tables.length}
        />

        {tables.length === 0 ? (
          <div className="rounded-md border border-dashed bg-muted/20 px-6 py-12 text-center">
            <p className="text-sm font-medium">No tables yet.</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Add one above — we&apos;ll generate the QR automatically.
            </p>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {tables.map((t) => (
              <TableQrCard
                key={t.id}
                table={t}
                catalogSlug={catalogSlug}
                catalogSubtitle={venueName}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

// ----------------------------------------------------------------------------
// ModeQrCard — Main / Pickup / Delivery
// ----------------------------------------------------------------------------

function ModeQrCard({
  qr,
  isModeEnabled,
  venueId,
  catalogSlug,
  modesEnabled,
  catalogSubtitle,
}: {
  qr: ModeQr;
  isModeEnabled: boolean;
  venueId: string;
  catalogSlug: string;
  modesEnabled: string[];
  catalogSubtitle: string;
}) {
  const [pending, startToggle] = useTransition();
  const kindLabel =
    qr.kind === "main"
      ? "Main"
      : qr.kind === "pickup"
        ? "Pickup"
        : "Delivery";
  const kindBlurb =
    qr.kind === "main"
      ? "Lands customers on the catalog and lets them pick a mode."
      : qr.kind === "pickup"
        ? "Lands customers in the pickup form (counter takeaway)."
        : "Lands customers in the delivery form (address required).";

  const onToggleMode = (next: boolean) => {
    if (qr.kind === "main") return;
    const nextModes = next
      ? Array.from(new Set([...modesEnabled, qr.kind]))
      : modesEnabled.filter((m) => m !== qr.kind);
    if (nextModes.length === 0) {
      toast.error("Keep at least one ordering mode enabled.");
      return;
    }
    startToggle(async () => {
      const result = await setVenueModes({
        venueId,
        catalogSlug,
        modes: nextModes as ("dine_in" | "pickup" | "delivery")[],
      });
      if (!result.ok) toast.error(result.error);
      else toast.success(`${kindLabel} ${next ? "enabled" : "disabled"}.`);
    });
  };

  return (
    <article
      className={cn(
        "flex flex-col gap-3 rounded-xl border bg-card p-4",
        !isModeEnabled && "opacity-60",
      )}
    >
      <header className="flex items-start justify-between gap-2">
        <div>
          <h3 className="text-sm font-medium">{kindLabel}</h3>
          <p className="mt-0.5 text-xs text-muted-foreground">{kindBlurb}</p>
        </div>
        {qr.kind !== "main" ? (
          <div className="flex items-center gap-1.5">
            <Switch
              checked={isModeEnabled}
              disabled={pending}
              onCheckedChange={onToggleMode}
              aria-label={`${isModeEnabled ? "Disable" : "Enable"} ${kindLabel}`}
            />
          </div>
        ) : null}
      </header>

      <QrPreview svg={qr.svg} muted={!isModeEnabled} />

      <div className="flex items-center justify-between gap-2">
        <code className="truncate font-mono text-[11px] text-muted-foreground">
          /q/{qr.shortcode}
        </code>
        <DownloadPngButton
          svg={qr.svg}
          fileName={`${catalogSlug}-${qr.kind}-qr.png`}
        />
      </div>

      {/* Stamp the catalog/venue name below the QR for printability —
          merchants who copy the SVG straight to a printer benefit from
          having the brand context already on the asset. */}
      <p className="text-center text-[11px] uppercase tracking-[0.12em] text-muted-foreground">
        {catalogSubtitle} · {kindLabel}
      </p>
    </article>
  );
}

// ----------------------------------------------------------------------------
// Tables: AddTableForm + TableQrCard
// ----------------------------------------------------------------------------

function AddTableForm({
  venueId,
  catalogSlug,
  existingCount,
}: {
  venueId: string;
  catalogSlug: string;
  existingCount: number;
}) {
  const [label, setLabel] = React.useState("");
  const [pending, startAdd] = useTransition();
  const inputRef = React.useRef<HTMLInputElement>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = label.trim();
    if (!trimmed) return;
    startAdd(async () => {
      const result = await createTable({
        venueId,
        label: trimmed,
        catalogSlug,
      });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(`Added "${trimmed}".`);
      setLabel("");
      // Refocus so the merchant can keep adding rapidly.
      inputRef.current?.focus();
    });
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="flex items-end gap-2 rounded-md border bg-card p-3"
    >
      <div className="flex flex-1 flex-col gap-1.5">
        <Label htmlFor="add-table-label" className="text-xs">
          Add a table
        </Label>
        <Input
          id="add-table-label"
          ref={inputRef}
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder={
            existingCount === 0 ? "e.g. Table 1" : `e.g. Table ${existingCount + 1}`
          }
          autoComplete="off"
          maxLength={64}
        />
      </div>
      <Button type="submit" size="sm" disabled={pending || !label.trim()} className="gap-1.5">
        {pending ? (
          <Loader2 className="size-3.5 animate-spin" aria-hidden />
        ) : (
          <Plus className="size-3.5" aria-hidden />
        )}
        Add
      </Button>
    </form>
  );
}

function TableQrCard({
  table,
  catalogSlug,
  catalogSubtitle,
}: {
  table: TableRow;
  catalogSlug: string;
  catalogSubtitle: string;
}) {
  const [labelDraft, setLabelDraft] = React.useState(table.label);
  const [pendingRename, startRename] = useTransition();
  const [pendingToggle, startToggle] = useTransition();
  const [pendingRegen, startRegen] = useTransition();
  const [pendingDelete, startDelete] = useTransition();

  // Keep local draft synced if the server-rendered prop changes
  // (e.g., after a revalidate from a sibling card).
  React.useEffect(() => {
    setLabelDraft(table.label);
  }, [table.label]);

  const onRenameCommit = () => {
    const trimmed = labelDraft.trim();
    if (!trimmed || trimmed === table.label) return;
    startRename(async () => {
      const result = await updateTable({
        tableId: table.id,
        catalogSlug,
        label: trimmed,
      });
      if (!result.ok) {
        toast.error(result.error);
        setLabelDraft(table.label);
      } else {
        toast.success("Renamed.");
      }
    });
  };

  const onToggleActive = (next: boolean) => {
    startToggle(async () => {
      const result = await updateTable({
        tableId: table.id,
        catalogSlug,
        isActive: next,
      });
      if (!result.ok) toast.error(result.error);
      else toast.success(next ? "Activated." : "Deactivated.");
    });
  };

  const onRegenerate = () => {
    if (!table.qrId) return;
    if (
      !window.confirm(
        `Regenerate the QR for "${table.label}"? The currently printed QR will stop working.`,
      )
    ) {
      return;
    }
    startRegen(async () => {
      const result = await regenerateQrShortcode({
        qrId: table.qrId!,
        catalogSlug,
      });
      if (!result.ok) toast.error(result.error);
      else toast.success("New QR generated. Reprint the table card.");
    });
  };

  const onDelete = () => {
    if (
      !window.confirm(
        `Delete "${table.label}"? The QR will stop working immediately.`,
      )
    ) {
      return;
    }
    startDelete(async () => {
      const result = await deleteTable({ tableId: table.id, catalogSlug });
      if (!result.ok) toast.error(result.error);
      else toast.success("Table removed.");
    });
  };

  return (
    <article
      className={cn(
        "flex flex-col gap-3 rounded-xl border bg-card p-4",
        !table.isActive && "opacity-60",
      )}
    >
      <header className="flex items-center justify-between gap-2">
        <Input
          value={labelDraft}
          onChange={(e) => setLabelDraft(e.target.value)}
          onBlur={onRenameCommit}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              (e.currentTarget as HTMLInputElement).blur();
            }
          }}
          disabled={pendingRename}
          className="h-8 flex-1 border-transparent bg-transparent px-2 text-sm font-medium focus-visible:border-input focus-visible:bg-background"
          aria-label="Table label"
        />
        <Switch
          checked={table.isActive}
          disabled={pendingToggle}
          onCheckedChange={onToggleActive}
          aria-label={table.isActive ? "Deactivate table" : "Activate table"}
        />
      </header>

      {table.svg ? (
        <QrPreview svg={table.svg} muted={!table.isActive} />
      ) : (
        <div className="grid aspect-square place-items-center rounded-md bg-muted/40 text-xs text-muted-foreground">
          QR pending
        </div>
      )}

      <p className="text-center text-[11px] uppercase tracking-[0.12em] text-muted-foreground">
        {catalogSubtitle} · {table.label}
      </p>

      <div className="flex items-center justify-between gap-2">
        <code className="truncate font-mono text-[11px] text-muted-foreground">
          /q/{table.shortcode || "—"}
        </code>
        <div className="flex items-center gap-1">
          {table.svg ? (
            <DownloadPngButton
              svg={table.svg}
              fileName={`${catalogSlug}-${slugify(table.label)}.png`}
            />
          ) : null}
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            disabled={pendingRegen || !table.qrId}
            onClick={onRegenerate}
            title="Regenerate shortcode (invalidates the printed QR)"
            aria-label="Regenerate shortcode"
          >
            {pendingRegen ? (
              <Loader2 className="size-3.5 animate-spin" aria-hidden />
            ) : (
              <RefreshCw className="size-3.5" aria-hidden />
            )}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-muted-foreground hover:text-destructive"
            disabled={pendingDelete}
            onClick={onDelete}
            title="Delete table"
            aria-label="Delete table"
          >
            {pendingDelete ? (
              <Loader2 className="size-3.5 animate-spin" aria-hidden />
            ) : (
              <Trash2 className="size-3.5" aria-hidden />
            )}
          </Button>
        </div>
      </div>
    </article>
  );
}

// ----------------------------------------------------------------------------
// QR rendering helpers
// ----------------------------------------------------------------------------

function QrPreview({
  svg,
  muted,
}: {
  svg: string;
  muted: boolean;
}) {
  // The SVG is pre-rendered server-side; we drop it in via
  // dangerouslySetInnerHTML so the browser can scale it natively.
  return (
    <div
      className={cn(
        "grid aspect-square place-items-center rounded-md border bg-white p-3",
        muted && "grayscale",
      )}
      role="img"
      aria-label="QR code preview"
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}

function DownloadPngButton({
  svg,
  fileName,
}: {
  svg: string;
  fileName: string;
}) {
  const [pending, setPending] = React.useState(false);
  const onClick = async () => {
    setPending(true);
    try {
      const url = await rasterizeSvgToPng(svg, 1024);
      const a = document.createElement("a");
      a.href = url;
      a.download = fileName;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Couldn't generate PNG.",
      );
    } finally {
      setPending(false);
    }
  };
  return (
    <Button
      variant="outline"
      size="sm"
      className="h-7 gap-1.5 px-2 text-xs"
      onClick={() => startTransition(onClick)}
      disabled={pending}
    >
      {pending ? (
        <Loader2 className="size-3.5 animate-spin" aria-hidden />
      ) : (
        <Download className="size-3.5" aria-hidden />
      )}
      PNG
    </Button>
  );
}

/**
 * Rasterize an inline SVG string to a PNG blob URL via an in-memory
 * <canvas>. Browser-only — no server round-trip. Output is square at
 * the requested pixel size.
 */
async function rasterizeSvgToPng(
  svg: string,
  pxSize: number,
): Promise<string> {
  const svgBlob = new Blob([svg], { type: "image/svg+xml;charset=utf-8" });
  const svgUrl = URL.createObjectURL(svgBlob);
  try {
    const img = new Image();
    img.crossOrigin = "anonymous";
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error("svg load failed"));
      img.src = svgUrl;
    });
    const canvas = document.createElement("canvas");
    canvas.width = pxSize;
    canvas.height = pxSize;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("no canvas context");
    ctx.fillStyle = "#FFFFFF";
    ctx.fillRect(0, 0, pxSize, pxSize);
    ctx.drawImage(img, 0, 0, pxSize, pxSize);
    return await new Promise<string>((resolve, reject) => {
      canvas.toBlob((blob) => {
        if (!blob) {
          reject(new Error("png encode failed"));
          return;
        }
        resolve(URL.createObjectURL(blob));
      }, "image/png");
    });
  } finally {
    URL.revokeObjectURL(svgUrl);
  }
}

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
