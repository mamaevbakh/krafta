"use client";

/**
 * QR Studio — merchant-facing customizer for the catalog's QR appearance.
 *
 * Lives at the top of the /qr-codes page. Owns its own draft state and
 * renders a live preview using the *same* renderQrSvg function as the
 * server (the renderer is isomorphic — pure JS, no DOM dependency).
 *
 * The studio surfaces every styling primitive lib/qr/render.ts supports:
 *   - Color (flat or 2-stop linear/radial gradient)
 *   - Background color (or transparent)
 *   - Module shape: square / dots / rounded
 *   - Eye outer shape: square / rounded / circle
 *   - Eye inner shape: square / rounded / circle
 *   - Center artwork: logo image OR centered Krafta wordmark OR custom
 *     wordmark text OR nothing
 *   - Bottom frame text ("Scan to order", table number, etc.)
 *
 * Save persists to catalogs.settings_qr_style; the page revalidates and
 * every QR (mode tiles + table tiles + ZIP route) re-renders with the
 * new style.
 *
 * DESIGN.md gradient ban: explicitly does NOT apply here (see memory
 * qr-studio-design-exception) — merchant-authored QR artwork is the
 * merchant's brand surface, not Krafta's product chrome. The studio UI
 * itself still stays Geist + monochrome + rounded-md.
 */

import * as React from "react";
import { useTransition } from "react";
import { toast } from "sonner";
import { Loader2, RotateCcw, Upload, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Slider } from "@/components/ui/slider";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

import {
  EYE_INNER_SHAPES,
  EYE_OUTER_SHAPES,
  MODULE_SHAPES,
  type QrStyleConfig,
  qrStyleConfigSchema,
} from "@/lib/qr/config";
import { renderQrSvg } from "@/lib/qr/render";
import {
  resetQrStyle,
  saveQrStyle,
  uploadQrLogo,
} from "@/lib/qr/actions";

// =========================================================================
// Module-shape preset chips
// =========================================================================

const MODULE_LABELS: Record<(typeof MODULE_SHAPES)[number], string> = {
  square: "Square",
  dots: "Dots",
  rounded: "Rounded",
};
const EYE_OUTER_LABELS: Record<(typeof EYE_OUTER_SHAPES)[number], string> = {
  square: "Square",
  rounded: "Rounded",
  circle: "Circle",
};
const EYE_INNER_LABELS: Record<(typeof EYE_INNER_SHAPES)[number], string> = {
  square: "Square",
  rounded: "Rounded",
  circle: "Circle",
};

// =========================================================================
// Color presets — quick swatches the merchant can tap before reaching
// for the picker. Cover the dominant Krafta neighborhood + a few common
// brand accents.
// =========================================================================

const COLOR_PRESETS: string[] = [
  "#000000",
  "#1A1A1A",
  "#2563EB",
  "#15803D",
  "#B91C1C",
  "#D97706",
  "#7C3AED",
  "#DB2777",
];

// =========================================================================
// Studio
// =========================================================================

export type QrStudioProps = {
  catalogId: string;
  catalogSlug: string;
  initialStyle: QrStyleConfig;
  /** A representative URL for the live preview. The page passes the
   *  "main" mode QR's URL so the preview always shows a realistic QR. */
  previewUrl: string;
};

export function QrStudio({
  catalogId,
  catalogSlug,
  initialStyle,
  previewUrl,
}: QrStudioProps) {
  const [draft, setDraft] = React.useState<QrStyleConfig>(initialStyle);
  const [previewSvg, setPreviewSvg] = React.useState<string>("");
  const [isPending, startTransition] = useTransition();
  const [isResetting, startReset] = useTransition();
  const [isUploading, setIsUploading] = React.useState(false);

  // Re-render the preview whenever the draft changes — debounced so
  // rapid slider drags don't thrash. renderQrSvg is pure JS and quick
  // (~5-10ms for a typical URL on a modern laptop) but the SVG injection
  // still costs paint.
  React.useEffect(() => {
    let cancelled = false;
    const handle = setTimeout(() => {
      void (async () => {
        const svg = await renderQrSvg(previewUrl, {
          style: draft,
          size: 360,
        });
        if (!cancelled) setPreviewSvg(svg);
      })();
    }, 50);
    return () => {
      cancelled = true;
      clearTimeout(handle);
    };
  }, [draft, previewUrl]);

  const hasUnsavedChanges = React.useMemo(
    () => JSON.stringify(draft) !== JSON.stringify(initialStyle),
    [draft, initialStyle],
  );

  const update = React.useCallback(
    <K extends keyof QrStyleConfig>(key: K, value: QrStyleConfig[K]) => {
      setDraft((prev) => {
        const next = { ...prev, [key]: value };
        // Re-normalize via the schema so any sub-object defaults fill
        // in (e.g. toggling a frame on with no color sets color = null,
        // which the renderer reads as "inherit fgColor").
        const result = qrStyleConfigSchema.safeParse(next);
        return result.success ? result.data : next;
      });
    },
    [],
  );

  const onSave = () => {
    startTransition(async () => {
      const result = await saveQrStyle({
        catalogId,
        catalogSlug,
        style: draft,
      });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("QR style saved.");
    });
  };

  const onReset = () => {
    startReset(async () => {
      const result = await resetQrStyle({
        catalogId,
        catalogSlug,
      });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      setDraft(result.style);
      toast.success("Reset to default style.");
    });
  };

  const onUploadLogo = (file: File) => {
    if (file.size > 512 * 1024) {
      toast.error("Logo must be 512 KB or smaller.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = String(reader.result ?? "");
      if (!dataUrl) {
        toast.error("Couldn't read the file.");
        return;
      }
      setIsUploading(true);
      void uploadQrLogo({ catalogId, dataUrl })
        .then((result) => {
          if (!result.ok) {
            toast.error(result.error);
            return;
          }
          update("logo", {
            src: result.src,
            size: draft.logo?.size ?? 0.22,
            margin: draft.logo?.margin ?? 1,
          });
          toast.success("Logo added.");
        })
        .finally(() => setIsUploading(false));
    };
    reader.onerror = () => toast.error("Couldn't read the file.");
    reader.readAsDataURL(file);
  };

  return (
    <section className="rounded-lg border bg-card">
      <header className="flex flex-col gap-1 border-b px-4 py-3 md:px-5 md:py-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-sm font-medium uppercase tracking-[0.12em] text-muted-foreground">
              QR studio
            </h2>
            <p className="mt-1 text-xs text-muted-foreground">
              Style every QR for this catalog — mode tiles, table tents,
              and the bulk-download set all use this look.
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={onReset}
              disabled={isResetting || isPending}
              className="gap-1.5 text-muted-foreground"
            >
              {isResetting ? (
                <Loader2 className="size-3.5 animate-spin" aria-hidden />
              ) : (
                <RotateCcw className="size-3.5" aria-hidden />
              )}
              Reset
            </Button>
            <Button
              size="sm"
              onClick={onSave}
              disabled={isPending || !hasUnsavedChanges}
            >
              {isPending ? (
                <>
                  <Loader2 className="size-3.5 animate-spin" aria-hidden />
                  Saving…
                </>
              ) : (
                "Save style"
              )}
            </Button>
          </div>
        </div>
      </header>

      <div className="grid gap-6 p-4 md:grid-cols-[320px_1fr] md:p-5">
        {/* Live preview. The SVG renderQrSvg returns carries intrinsic
            width/height attributes which we override via the descendant
            selector so the artwork respects its container — without that,
            the SVG renders at its absolute pixel size and overflows the
            grid cell. */}
        <div className="flex flex-col items-center gap-3">
          <div
            className="grid aspect-square w-full max-w-[320px] place-items-center overflow-hidden rounded-md border bg-white p-3 [&>svg]:h-full [&>svg]:max-h-full [&>svg]:w-full [&>svg]:max-w-full"
            role="img"
            aria-label="QR style preview"
            dangerouslySetInnerHTML={{ __html: previewSvg }}
          />
          <p className="text-center text-xs text-muted-foreground">
            Preview — the saved style applies to every QR below.
          </p>
        </div>

        {/* Controls */}
        <Tabs defaultValue="style" className="flex flex-col gap-3">
          <TabsList className="self-start">
            <TabsTrigger value="style">Style</TabsTrigger>
            <TabsTrigger value="brand">Brand</TabsTrigger>
            <TabsTrigger value="frame">Frame</TabsTrigger>
          </TabsList>

          {/* -------------------------------------------------- Style tab */}
          <TabsContent value="style" className="flex flex-col gap-5 pt-2">
            <ShapeSelectGroup
              label="Module shape"
              options={MODULE_SHAPES}
              labels={MODULE_LABELS}
              value={draft.moduleShape}
              onChange={(value) => update("moduleShape", value)}
            />
            <ShapeSelectGroup
              label="Eye outer"
              options={EYE_OUTER_SHAPES}
              labels={EYE_OUTER_LABELS}
              value={draft.eyeOuterShape}
              onChange={(value) => update("eyeOuterShape", value)}
            />
            <ShapeSelectGroup
              label="Eye inner"
              options={EYE_INNER_SHAPES}
              labels={EYE_INNER_LABELS}
              value={draft.eyeInnerShape}
              onChange={(value) => update("eyeInnerShape", value)}
            />

            {/* Hide the FG color row entirely when a gradient is on —
                showing it disabled with a "currently overridden" hint was
                confusing in QA. The merchant can toggle the gradient
                off to get the picker back. */}
            {!draft.fgGradient ? (
              <ColorRow
                label="Foreground color"
                value={draft.fgColor}
                onChange={(value) => update("fgColor", value)}
              />
            ) : null}
            <ColorRow
              label="Background color"
              value={draft.bgColor}
              onChange={(value) => update("bgColor", value)}
              allowTransparent
              onTransparent={() => update("bgColor", "#FFFFFF")}
            />

            <GradientRow
              gradient={draft.fgGradient}
              onChange={(value) => update("fgGradient", value)}
            />
          </TabsContent>

          {/* -------------------------------------------------- Brand tab */}
          <TabsContent value="brand" className="flex flex-col gap-5 pt-2">
            <div className="flex flex-col gap-2">
              <Label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Wordmark
              </Label>
              <div className="flex flex-col gap-2">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                  <Input
                    placeholder="Krafta"
                    value={draft.wordmark ?? ""}
                    maxLength={20}
                    disabled={!!draft.logo}
                    onChange={(e) =>
                      update(
                        "wordmark",
                        e.target.value === "" ? null : e.target.value,
                      )
                    }
                    className="sm:max-w-[220px]"
                  />
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={!!draft.logo}
                    onClick={() => update("wordmark", "")}
                    className="self-start text-muted-foreground"
                  >
                    Hide
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  Leave empty for the default Krafta wordmark, type your
                  own brand (e.g. <span className="font-mono">My Café</span>
                  ), or hide it. Logos override wordmarks.
                </p>
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <Label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Logo
              </Label>
              {draft.logo ? (
                <div className="flex flex-col gap-3 rounded-md border p-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className="grid size-12 shrink-0 place-items-center rounded border bg-white">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={draft.logo.src}
                          alt="Logo"
                          className="size-10 object-contain"
                        />
                      </div>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">
                          Logo attached
                        </p>
                        <p className="truncate text-xs text-muted-foreground">
                          Centered with a white halo.
                        </p>
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => update("logo", null)}
                      aria-label="Remove logo"
                    >
                      <X className="size-4" />
                    </Button>
                  </div>
                  <div className="flex flex-col gap-2">
                    <Label className="text-xs text-muted-foreground">
                      Size:{" "}
                      <span className="font-mono text-foreground">
                        {Math.round(draft.logo.size * 100)}%
                      </span>{" "}
                      of QR
                    </Label>
                    <Slider
                      min={10}
                      max={30}
                      step={1}
                      value={[Math.round(draft.logo.size * 100)]}
                      onValueChange={(values) => {
                        const v = values[0] ?? 22;
                        update("logo", {
                          ...draft.logo!,
                          size: v / 100,
                        });
                      }}
                    />
                  </div>
                </div>
              ) : (
                <LogoUploadButton
                  onFile={onUploadLogo}
                  isUploading={isUploading}
                />
              )}
            </div>
          </TabsContent>

          {/* -------------------------------------------------- Frame tab */}
          <TabsContent value="frame" className="flex flex-col gap-5 pt-2">
            <div className="flex items-center justify-between gap-3 rounded-md border p-3">
              <div>
                <p className="text-sm font-medium">Frame label</p>
                <p className="text-xs text-muted-foreground">
                  Adds a short caption below the QR — like
                  &ldquo;Scan to order&rdquo; or a table number.
                </p>
              </div>
              <Switch
                checked={!!draft.frame}
                onCheckedChange={(checked) =>
                  update(
                    "frame",
                    checked ? { text: "Scan to order", color: null } : null,
                  )
                }
                aria-label="Toggle frame label"
              />
            </div>
            {draft.frame ? (
              <div className="flex flex-col gap-3 rounded-md border p-3">
                <div className="flex flex-col gap-2">
                  <Label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Text
                  </Label>
                  <Input
                    value={draft.frame.text}
                    maxLength={40}
                    onChange={(e) =>
                      update("frame", {
                        ...draft.frame!,
                        text: e.target.value,
                      })
                    }
                  />
                  <p className="text-xs text-muted-foreground">
                    Up to 24 characters fits the print scale cleanly.
                  </p>
                </div>
                <ColorRow
                  label="Frame color"
                  value={draft.frame.color ?? draft.fgColor}
                  onChange={(value) =>
                    update("frame", { ...draft.frame!, color: value })
                  }
                />
              </div>
            ) : null}
          </TabsContent>
        </Tabs>
      </div>
    </section>
  );
}

// =========================================================================
// Sub-components
// =========================================================================

function ShapeSelectGroup<T extends string>({
  label,
  options,
  labels,
  value,
  onChange,
}: {
  label: string;
  options: readonly T[];
  labels: Record<T, string>;
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <div className="flex flex-col gap-2">
      <Label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </Label>
      <div className="flex flex-wrap gap-1.5">
        {options.map((opt) => (
          <button
            key={opt}
            type="button"
            onClick={() => onChange(opt)}
            className={cn(
              "rounded-md border px-3 py-1.5 text-sm transition-colors",
              value === opt
                ? "border-foreground bg-foreground text-background"
                : "border-input bg-background text-foreground hover:bg-muted",
            )}
            aria-pressed={value === opt}
          >
            {labels[opt]}
          </button>
        ))}
      </div>
    </div>
  );
}

function ColorRow({
  label,
  value,
  onChange,
  disabled = false,
  disabledHint,
  allowTransparent = false,
  onTransparent,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  disabledHint?: string;
  allowTransparent?: boolean;
  onTransparent?: () => void;
}) {
  const isTransparent = value === "transparent";
  return (
    <div className="flex flex-col gap-2">
      <Label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </Label>
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="color"
          value={isTransparent ? "#FFFFFF" : value}
          onChange={(e) => onChange(e.target.value.toUpperCase())}
          disabled={disabled || isTransparent}
          className="h-9 w-12 cursor-pointer rounded-md border bg-background p-0 disabled:cursor-not-allowed disabled:opacity-50"
          aria-label={`${label} picker`}
        />
        <Input
          value={value}
          onChange={(e) => onChange(e.target.value.toUpperCase())}
          disabled={disabled}
          className="h-9 max-w-[110px] font-mono text-sm uppercase"
          maxLength={7}
        />
        <div className="flex flex-wrap gap-1">
          {COLOR_PRESETS.map((preset) => (
            <button
              key={preset}
              type="button"
              onClick={() => onChange(preset)}
              disabled={disabled}
              className={cn(
                "size-6 rounded-md border transition",
                value === preset && "ring-2 ring-foreground ring-offset-1 ring-offset-background",
                disabled && "cursor-not-allowed opacity-40",
              )}
              style={{ backgroundColor: preset }}
              aria-label={`Pick ${preset}`}
            />
          ))}
        </div>
        {allowTransparent ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() =>
              isTransparent
                ? onTransparent?.()
                : onChange("transparent")
            }
            disabled={disabled}
            className="text-xs text-muted-foreground"
          >
            {isTransparent ? "Use a color" : "Transparent"}
          </Button>
        ) : null}
      </div>
      {disabled && disabledHint ? (
        <p className="text-xs text-muted-foreground">{disabledHint}</p>
      ) : null}
    </div>
  );
}

function GradientRow({
  gradient,
  onChange,
}: {
  gradient: QrStyleConfig["fgGradient"];
  onChange: (next: QrStyleConfig["fgGradient"]) => void;
}) {
  const enabled = !!gradient;
  const stop0 = gradient?.stops?.[0]?.color ?? "#000000";
  const stop1 = gradient?.stops?.[1]?.color ?? "#FF5500";
  const type = gradient?.type ?? "linear";
  const rotation = gradient?.rotation ?? 0;

  return (
    <div className="flex flex-col gap-2 rounded-md border p-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-medium">Gradient</p>
          <p className="text-xs text-muted-foreground">
            Two-stop gradient for the dark modules. Overrides the
            foreground color.
          </p>
        </div>
        <Switch
          checked={enabled}
          onCheckedChange={(checked) => {
            if (!checked) {
              onChange(null);
              return;
            }
            onChange({
              type: "linear",
              rotation: 0,
              stops: [
                { offset: 0, color: stop0 },
                { offset: 1, color: stop1 },
              ],
            });
          }}
          aria-label="Toggle gradient"
        />
      </div>
      {enabled ? (
        <div className="mt-1 flex flex-col gap-3">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <Label className="text-xs text-muted-foreground sm:w-24">
              Type
            </Label>
            <Select
              value={type}
              onValueChange={(v) =>
                onChange({
                  type: v as "linear" | "radial",
                  rotation: rotation,
                  stops: [
                    { offset: 0, color: stop0 },
                    { offset: 1, color: stop1 },
                  ],
                })
              }
            >
              <SelectTrigger className="h-9 sm:max-w-[180px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="linear">Linear</SelectItem>
                <SelectItem value="radial">Radial</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {type === "linear" ? (
            <div className="flex flex-col gap-2">
              <Label className="text-xs text-muted-foreground">
                Rotation:{" "}
                <span className="font-mono text-foreground">{rotation}°</span>
              </Label>
              <Slider
                min={0}
                max={360}
                step={15}
                value={[rotation]}
                onValueChange={(values) =>
                  onChange({
                    type: "linear",
                    rotation: values[0] ?? 0,
                    stops: [
                      { offset: 0, color: stop0 },
                      { offset: 1, color: stop1 },
                    ],
                  })
                }
              />
            </div>
          ) : null}
          <ColorRow
            label="From"
            value={stop0}
            onChange={(value) =>
              onChange({
                type,
                rotation,
                stops: [
                  { offset: 0, color: value },
                  { offset: 1, color: stop1 },
                ],
              })
            }
          />
          <ColorRow
            label="To"
            value={stop1}
            onChange={(value) =>
              onChange({
                type,
                rotation,
                stops: [
                  { offset: 0, color: stop0 },
                  { offset: 1, color: value },
                ],
              })
            }
          />
        </div>
      ) : null}
    </div>
  );
}

function LogoUploadButton({
  onFile,
  isUploading,
}: {
  onFile: (file: File) => void;
  isUploading: boolean;
}) {
  const inputRef = React.useRef<HTMLInputElement>(null);
  return (
    <TooltipProvider delayDuration={150}>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            type="button"
            variant="outline"
            onClick={() => inputRef.current?.click()}
            disabled={isUploading}
            className="w-full gap-2"
          >
            {isUploading ? (
              <Loader2 className="size-4 animate-spin" aria-hidden />
            ) : (
              <Upload className="size-4" aria-hidden />
            )}
            {isUploading ? "Uploading…" : "Upload logo"}
            <input
              ref={inputRef}
              type="file"
              accept="image/png,image/jpeg,image/svg+xml,image/webp"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) onFile(file);
                e.target.value = "";
              }}
            />
          </Button>
        </TooltipTrigger>
        <TooltipContent>
          PNG, JPEG, SVG, or WEBP. Up to 512 KB. Square logos work best.
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
