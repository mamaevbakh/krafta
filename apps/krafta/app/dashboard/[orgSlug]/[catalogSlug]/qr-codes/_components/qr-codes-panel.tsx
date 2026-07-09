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

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/locales/dashboard/context";

import {
  createTable,
  deleteTable,
  regenerateQrShortcode,
  setVenueModes,
  updateTable,
} from "@/lib/tables/actions";
import type { QrStyleConfig } from "@/lib/qr/config";
import { inlineSvgImages } from "@/lib/qr/inline-images";

import { QrStudio } from "./qr-studio";

type ModeQr = {
  kind: "main" | "pickup" | "delivery";
  qrId: string;
  shortcode: string;
  url: string;
  svg: string;
  isActive: boolean;
  // KRA-26 follow-up: lifetime + rolling-7d counts from qr_scans. The
  // panel renders them as a single chip; if both are 0 we render a
  // "no scans yet" muted hint instead.
  scanCountTotal: number;
  scanCountLast7: number;
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
  scanCountTotal: number;
  scanCountLast7: number;
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
  initialQrStyle: QrStyleConfig;
  previewUrl: string;
};

export function QrCodesPanel({
  catalogId,
  catalogName,
  catalogSlug,
  venueId,
  venueName,
  modesEnabled,
  modeQrs,
  tables,
  initialQrStyle,
  previewUrl,
}: QrCodesPanelProps) {
  const t = useT();
  const modeQrByKind = React.useMemo(() => {
    const map: Partial<Record<ModeQr["kind"], ModeQr>> = {};
    for (const qr of modeQrs) map[qr.kind] = qr;
    return map;
  }, [modeQrs]);

  return (
    <div className="mx-auto flex max-w-[1248px] flex-col gap-8 px-6 py-8">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">
          {t("qr.page_title")}
        </h1>
        <p className="text-sm text-muted-foreground">
          {t("qr.page_subtitle", { name: catalogName })}
        </p>
      </header>

      <QrStudio
        catalogId={catalogId}
        catalogSlug={catalogSlug}
        initialStyle={initialQrStyle}
        previewUrl={previewUrl}
      />

      <section className="flex flex-col gap-4">
        <h2 className="text-sm font-medium uppercase tracking-[0.12em] text-muted-foreground">
          {t("qr.mode_qrs_title")}
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
              {t("qr.tables_title")}
            </h2>
            <p className="mt-1 text-xs text-muted-foreground">
              {t("qr.tables_hint")}
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
                {t("qr.download_all_zip")}
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
            <p className="text-sm font-medium">{t("qr.no_tables_title")}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              {t("qr.no_tables_hint")}
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
  const t = useT();
  const [pending, startToggle] = useTransition();
  const kindLabel =
    qr.kind === "main"
      ? t("qr.mode_main")
      : qr.kind === "pickup"
        ? t("qr.mode_pickup")
        : t("qr.mode_delivery");
  const kindBlurb =
    qr.kind === "main"
      ? t("qr.mode_main_blurb")
      : qr.kind === "pickup"
        ? t("qr.mode_pickup_blurb")
        : t("qr.mode_delivery_blurb");

  const onToggleMode = (next: boolean) => {
    if (qr.kind === "main") return;
    const nextModes = next
      ? Array.from(new Set([...modesEnabled, qr.kind]))
      : modesEnabled.filter((m) => m !== qr.kind);
    if (nextModes.length === 0) {
      toast.error(t("qr.keep_one_mode"));
      return;
    }
    startToggle(async () => {
      const result = await setVenueModes({
        venueId,
        catalogSlug,
        modes: nextModes as ("dine_in" | "pickup" | "delivery")[],
      });
      if (!result.ok) toast.error(result.error);
      else
        toast.success(
          next
            ? t("qr.mode_enabled", { mode: kindLabel })
            : t("qr.mode_disabled", { mode: kindLabel }),
        );
    });
  };

  return (
    <article
      className={cn(
        "flex flex-col gap-3 rounded-lg border bg-card p-4",
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
              aria-label={
                isModeEnabled
                  ? t("qr.disable_mode_aria", { mode: kindLabel })
                  : t("qr.enable_mode_aria", { mode: kindLabel })
              }
            />
          </div>
        ) : null}
      </header>

      <QrPreview svg={qr.svg} muted={!isModeEnabled} />

      <ScanCountLine
        total={qr.scanCountTotal}
        last7={qr.scanCountLast7}
      />

      <div className="flex items-center justify-between gap-2">
        <code className="truncate font-mono text-xs text-muted-foreground">
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
      <p className="text-center text-xs uppercase tracking-[0.12em] text-muted-foreground">
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
  const t = useT();
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
      toast.success(t("qr.table_added", { label: trimmed }));
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
          {t("qr.add_table_label")}
        </Label>
        <Input
          id="add-table-label"
          ref={inputRef}
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder={t("qr.add_table_placeholder", { n: existingCount + 1 })}
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
        {t("common.add")}
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
  const t = useT();
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
        toast.success(t("qr.table_renamed"));
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
      else toast.success(next ? t("qr.table_activated") : t("qr.table_deactivated"));
    });
  };

  // Destructive handlers — no more window.confirm; the AlertDialog
  // primitive owns the confirm step (rendered below in the JSX). Each
  // handler is invoked from AlertDialogAction onClick after the merchant
  // confirms in the dialog.
  const onRegenerateConfirmed = () => {
    if (!table.qrId) return;
    startRegen(async () => {
      const result = await regenerateQrShortcode({
        qrId: table.qrId!,
        catalogSlug,
      });
      if (!result.ok) toast.error(result.error);
      else toast.success(t("qr.qr_regenerated"));
    });
  };

  const onDeleteConfirmed = () => {
    startDelete(async () => {
      const result = await deleteTable({ tableId: table.id, catalogSlug });
      if (!result.ok) toast.error(result.error);
      else toast.success(t("qr.table_removed"));
    });
  };

  return (
    <article
      className={cn(
        "flex flex-col gap-3 rounded-lg border bg-card p-4",
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
          aria-label={t("qr.table_label_aria")}
        />
        <Switch
          checked={table.isActive}
          disabled={pendingToggle}
          onCheckedChange={onToggleActive}
          aria-label={
            table.isActive
              ? t("qr.deactivate_table_aria")
              : t("qr.activate_table_aria")
          }
        />
      </header>

      {table.svg ? (
        <QrPreview svg={table.svg} muted={!table.isActive} />
      ) : (
        <div className="grid aspect-square place-items-center rounded-md bg-muted/40 text-xs text-muted-foreground">
          {t("qr.qr_pending")}
        </div>
      )}

      <p className="text-center text-xs uppercase tracking-[0.12em] text-muted-foreground">
        {catalogSubtitle} · {table.label}
      </p>

      <ScanCountLine
        total={table.scanCountTotal}
        last7={table.scanCountLast7}
      />

      <div className="flex items-center justify-between gap-2">
        <code className="truncate font-mono text-xs text-muted-foreground">
          /q/{table.shortcode || "—"}
        </code>
        <div className="flex items-center gap-1">
          {table.svg ? (
            <DownloadPngButton
              svg={table.svg}
              fileName={`${catalogSlug}-${slugify(table.label)}.png`}
            />
          ) : null}
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                disabled={pendingRegen || !table.qrId}
                title={t("qr.regenerate_shortcode_title")}
                aria-label={t("qr.regenerate_shortcode_aria")}
              >
                {pendingRegen ? (
                  <Loader2 className="size-3.5 animate-spin" aria-hidden />
                ) : (
                  <RefreshCw className="size-3.5" aria-hidden />
                )}
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>
                  {t("qr.regenerate_confirm_title", { label: table.label })}
                </AlertDialogTitle>
                <AlertDialogDescription>
                  {t("qr.regenerate_confirm_desc")}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
                <AlertDialogAction onClick={onRegenerateConfirmed}>
                  {t("qr.regenerate")}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-muted-foreground hover:text-destructive"
                disabled={pendingDelete}
                title={t("qr.delete_table")}
                aria-label={t("qr.delete_table")}
              >
                {pendingDelete ? (
                  <Loader2 className="size-3.5 animate-spin" aria-hidden />
                ) : (
                  <Trash2 className="size-3.5" aria-hidden />
                )}
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>
                  {t("qr.delete_confirm_title", { label: table.label })}
                </AlertDialogTitle>
                <AlertDialogDescription>
                  {t("qr.delete_confirm_desc")}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
                <AlertDialogAction
                  onClick={onDeleteConfirmed}
                  className="bg-destructive text-white hover:bg-destructive/90"
                >
                  {t("qr.delete_table")}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>
    </article>
  );
}

// ----------------------------------------------------------------------------
// QR rendering helpers
// ----------------------------------------------------------------------------

function ScanCountLine({
  total,
  last7,
}: {
  total: number;
  last7: number;
}) {
  const t = useT();
  // Compact single-line readout. Three states:
  //   - never scanned: muted hint nudging the merchant to print + share
  //   - scanned but quiet this week: just the lifetime total
  //   - active: lifetime + this-week delta
  // Numbers are mono so they read as data, not prose.
  if (total === 0) {
    return (
      <p className="text-xs text-muted-foreground">
        {t("qr.no_scans")}
      </p>
    );
  }
  return (
    <p className="text-xs text-muted-foreground">
      <span className="font-mono font-medium tabular-nums text-foreground">
        {total.toLocaleString()}
      </span>{" "}
      {t("qr.scans_word")}
      {last7 > 0 ? (
        <>
          {" · "}
          <span className="font-mono tabular-nums">{last7}</span>{" "}
          {t("qr.scans_this_week")}
        </>
      ) : null}
    </p>
  );
}

function QrPreview({
  svg,
  muted,
}: {
  svg: string;
  muted: boolean;
}) {
  const t = useT();
  // The SVG is pre-rendered server-side; we drop it in via
  // dangerouslySetInnerHTML so the browser can scale it natively.
  return (
    <div
      className={cn(
        "grid aspect-square place-items-center rounded-md border bg-white p-3",
        muted && "grayscale",
      )}
      role="img"
      aria-label={t("qr.qr_preview_aria")}
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
  const t = useT();
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
        err instanceof Error ? err.message : t("qr.png_error"),
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
 *
 * Any external <image href="https://…"> (a custom logo) is inlined to a
 * data URI first: a browser blocks external resource loads when an SVG is
 * drawn through an <img>, so without inlining the logo rasterizes as the
 * broken-image placeholder.
 */
async function rasterizeSvgToPng(
  rawSvg: string,
  pxSize: number,
): Promise<string> {
  const svg = await inlineSvgImages(rawSvg);
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
