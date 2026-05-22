"use client";

/**
 * photo-uploader.tsx — KRA-88 Slice 1 (polished per Supabase docs review).
 *
 * Replaces the read-only Photos grid in the EditorSheet with an editable
 * uploader. Two states:
 *
 *   - EMPTY (no photos yet): shadcn Empty + drop-aware dropzone.
 *   - POPULATED (1+ photos): 3-column grid + trailing "+ Add photo"
 *     tile. The whole grid container is drop-aware.
 *
 * Drag-and-drop (HTML5 native, no library):
 *   - onDragEnter / onDragOver / onDragLeave / onDrop on the wrapper.
 *   - preventDefault on dragover (otherwise drop never fires).
 *   - Drag counter ref counters spurious child-enter/leave events that
 *     toggle the highlight on every nested element traversal.
 *
 * Client-side validation (saves a roundtrip when a file is obviously
 * bad — invalid MIME or > 10 MB):
 *   - MIME must be in ACCEPTED_MIME_TYPES.
 *   - Per-file size ≤ MAX_BYTES (10 MB — Supabase recommends TUS
 *     resumable upload above 6 MB; we keep the limit comfortable since
 *     menu photos are small and we don't want to ship the TUS client
 *     yet).
 *   - Batch ≤ MAX_FILES_PER_BATCH (10).
 *
 * Upload flow (per Supabase Storage docs — signed-upload-url pattern):
 *   1. POST /api/items/media/upload-url  →  signed PUT URLs + media ids.
 *   2. PUT each file to its signed URL in parallel. Pass Content-Type
 *      and a long Cache-Control (menu photos are content-addressed via
 *      UUID storage paths, so they're effectively immutable; safe to
 *      cache hard).
 *   3. POST /api/items/media to register the successful rows.
 *   4. router.refresh() to surface the new media on the canvas.
 *
 * Placeholder tiles: while uploads are in flight, we render greyed
 * tiles with a spinner inline alongside the existing photos so the
 * merchant sees per-file progress instead of a single global "Uploading"
 * spinner. The tiles vanish when router.refresh re-renders with the
 * new media rows.
 *
 * Failure modes:
 *   - upload-url 4xx/5xx → toast.error, no rows registered.
 *   - Storage PUT failure → toast.error per-file, skip registration for
 *     failed uploads (successful peers in the same batch still register).
 *   - register POST failure → toast.error, orphans exist in Storage
 *     (cleanup via /api/items/media/cleanup periodic job — out of scope).
 *
 * Slice 2 (separate PR): dnd-kit drag-reorder + primary toggle in the
 * 3-dot menu + per-image alt text.
 */

import * as React from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { toast } from "sonner";
import {
  ImagePlus,
  Loader2,
  MoreVertical,
  Plus,
  Star,
  Trash2,
} from "lucide-react";
import {
  DndContext,
  DragEndEvent,
  PointerSensor,
  TouchSensor,
  closestCenter,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  rectSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Validation constants
// ---------------------------------------------------------------------------

const ACCEPTED_MIME_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/avif",
  "image/heic",
  "image/heif",
  "image/gif",
]);

const ACCEPTED_MIME_ATTR = Array.from(ACCEPTED_MIME_TYPES).join(",");

/** Per-file size ceiling (10 MB). Supabase standard uploads target
 *  ≤ 6 MB; we allow some headroom but flag anything bigger client-side
 *  before requesting a signed URL. */
const MAX_BYTES = 10 * 1024 * 1024;

/** Max files in one drop / select operation. Prevents accidental
 *  100-file dumps that would saturate the merchant's upstream. */
const MAX_FILES_PER_BATCH = 10;

/** Cache-Control header sent on the Storage PUT. Storage paths are
 *  content-addressed via UUID (per upload-url route), so files are
 *  effectively immutable — a long cache is safe and slashes egress. */
const CACHE_CONTROL_HEADER = "public, max-age=31536000, immutable";

function humanizeMB(bytes: number) {
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * validateFiles — splits the dropped/selected list into accepted + a
 * list of rejection reasons. Rejections fire as individual toasts so
 * the merchant knows exactly which file failed and why.
 */
function validateFiles(input: File[]): {
  accepted: File[];
  rejections: Array<{ file: File; reason: string }>;
} {
  const accepted: File[] = [];
  const rejections: Array<{ file: File; reason: string }> = [];

  for (const file of input) {
    if (!ACCEPTED_MIME_TYPES.has(file.type)) {
      rejections.push({
        file,
        reason: file.type ? `${file.type} isn't supported` : "Unknown file type",
      });
      continue;
    }
    if (file.size > MAX_BYTES) {
      rejections.push({
        file,
        reason: `Too large (${humanizeMB(file.size)} > ${humanizeMB(MAX_BYTES)})`,
      });
      continue;
    }
    accepted.push(file);
  }

  return { accepted, rejections };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export type PhotoUploaderMedia = {
  id: string;
  bucket: string;
  storage_path: string;
  is_primary: boolean;
  /** Optional metadata captured during upload. Required when the parent
   *  is in CREATE mode (the metadata gets bundled into createItem's
   *  photoUploads payload). Edit mode reads these from server rows. */
  kind?: "image" | "video";
  mime_type?: string | null;
  bytes?: number | null;
  alt?: string | null;
};

export type PhotoUploaderProps = {
  /** For edit mode: existing item id. For create mode: pre-generated
   *  UUID the client will pass to createItem on Save (storage paths
   *  use this id; the items row doesn't exist yet). */
  itemId: string;
  orgId: string;
  catalogId: string;
  media: PhotoUploaderMedia[];
  /** CREATE MODE — when provided, the component skips all API calls
   *  (no register/delete/reorder/primary fetches) and bubbles mutations
   *  through this callback. The parent owns the media state. Upload to
   *  Storage still happens (signed URLs work without an existing
   *  items row), but the item_media row insert is deferred to the
   *  parent's createItem dispatch on Save. */
  onLocalMediaChange?: (media: PhotoUploaderMedia[]) => void;
};

export function PhotoUploader({
  itemId,
  orgId,
  catalogId,
  media,
  onLocalMediaChange,
}: PhotoUploaderProps) {
  const isCreateMode = Boolean(onLocalMediaChange);
  const router = useRouter();
  const fileInputRef = React.useRef<HTMLInputElement | null>(null);
  /** In-flight upload count → render that many placeholder tiles. */
  const [uploadingCount, setUploadingCount] = React.useState(0);
  /** Drag-over highlight state. */
  const [dragging, setDragging] = React.useState(false);
  /** Drag counter for nested element traversal. dragenter / dragleave
   *  fire on every child element transition; counting tells us when
   *  we've truly left the root. */
  const dragCounterRef = React.useRef(0);

  const baseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const mediaWithUrls = React.useMemo(
    () =>
      media.map((m) => ({
        ...m,
        url: baseUrl
          ? `${baseUrl}/storage/v1/object/public/${m.bucket}/${m.storage_path}`
          : null,
      })),
    [media, baseUrl],
  );

  // -----------------------------------------------------------------------
  // Upload pipeline
  // -----------------------------------------------------------------------

  const handleFiles = React.useCallback(
    async (incoming: File[]) => {
      if (incoming.length === 0) return;

      // 1. Client-side validation (saves a roundtrip on obvious rejects).
      const { accepted, rejections } = validateFiles(incoming);
      rejections.forEach((r) =>
        toast.error(`${r.file.name}: ${r.reason}`),
      );
      if (accepted.length === 0) return;

      // 2. Batch cap.
      const files = accepted.slice(0, MAX_FILES_PER_BATCH);
      if (accepted.length > MAX_FILES_PER_BATCH) {
        toast.error(
          `Only the first ${MAX_FILES_PER_BATCH} files were uploaded. Try a smaller batch.`,
        );
      }

      setUploadingCount((n) => n + files.length);
      try {
        // 3. Request signed upload URLs.
        const urlResp = await fetch("/api/items/media/upload-url", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            itemId,
            orgId,
            catalogId,
            files: files.map((f) => ({
              name: f.name,
              type: f.type,
              size: f.size,
            })),
          }),
        });

        if (!urlResp.ok) {
          const body = await urlResp.json().catch(() => null);
          throw new Error(body?.error ?? "Failed to prepare upload.");
        }

        const { uploads } = (await urlResp.json()) as {
          uploads: Array<{
            id: string;
            bucket: string;
            storagePath: string;
            signedUrl: string;
            kind: "image" | "video";
            mimeType: string | null;
            bytes: number | null;
          }>;
        };

        // 4. PUT each file to its signed URL. Parallel; individual
        //    failures toast and don't block successful peers.
        //    Cache-Control: long-lived (UUID-addressed paths are
        //    effectively immutable).
        const results = await Promise.all(
          uploads.map(async (upload, idx) => {
            try {
              const file = files[idx];
              const headers: Record<string, string> = {
                "cache-control": CACHE_CONTROL_HEADER,
              };
              if (file.type) headers["content-type"] = file.type;
              const putResp = await fetch(upload.signedUrl, {
                method: "PUT",
                headers,
                body: file,
              });
              if (!putResp.ok) {
                throw new Error(`Upload failed (${putResp.status})`);
              }
              return { ok: true as const, upload };
            } catch (err) {
              const message =
                err instanceof Error ? err.message : "Upload failed.";
              toast.error(`${files[idx].name}: ${message}`);
              return { ok: false as const };
            }
          }),
        );

        const successful = results
          .filter(
            (r): r is { ok: true; upload: (typeof uploads)[number] } => r.ok,
          )
          .map((r) => ({
            id: r.upload.id,
            bucket: r.upload.bucket,
            storage_path: r.upload.storagePath,
            kind: r.upload.kind,
            mime_type: r.upload.mimeType,
            bytes: r.upload.bytes,
          }));

        if (successful.length === 0) return;

        // 5. Either register on the server (edit mode) OR push to
        //    parent's local state (create mode — items row doesn't exist
        //    yet; registration is deferred to the parent's createItem
        //    dispatch on Save).
        if (isCreateMode && onLocalMediaChange) {
          const newEntries: PhotoUploaderMedia[] = successful.map((u, idx) => ({
            id: u.id,
            bucket: u.bucket,
            storage_path: u.storage_path,
            // Primary: first uploaded photo if there were no existing ones.
            is_primary: media.length === 0 && idx === 0,
            kind: u.kind,
            mime_type: u.mime_type,
            bytes: u.bytes,
            alt: null,
          }));
          onLocalMediaChange([...media, ...newEntries]);
          toast.success(
            newEntries.length === 1
              ? "Photo added"
              : `${newEntries.length} photos added`,
          );
        } else {
          const registerResp = await fetch("/api/items/media", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ itemId, uploads: successful }),
          });

          if (!registerResp.ok) {
            const body = await registerResp.json().catch(() => null);
            throw new Error(body?.error ?? "Failed to save photos.");
          }

          toast.success(
            successful.length === 1
              ? "Photo added"
              : `${successful.length} photos added`,
          );
          router.refresh();
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : "Upload failed.";
        toast.error(message);
      } finally {
        setUploadingCount((n) => Math.max(0, n - files.length));
        if (fileInputRef.current) fileInputRef.current.value = "";
      }
    },
    [itemId, orgId, catalogId, router],
  );

  const handleDelete = React.useCallback(
    async (mediaId: string) => {
      // Create mode: remove from local state. Storage file becomes an
      // orphan, picked up later by /api/items/media/cleanup.
      if (isCreateMode && onLocalMediaChange) {
        const next = media.filter((m) => m.id !== mediaId);
        // If we removed the primary, promote the new first.
        if (next.length > 0 && !next.some((m) => m.is_primary)) {
          next[0] = { ...next[0], is_primary: true };
        }
        onLocalMediaChange(next);
        return;
      }
      try {
        const resp = await fetch("/api/items/media", {
          method: "DELETE",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ itemId, mediaIds: [mediaId] }),
        });
        if (!resp.ok) {
          const body = await resp.json().catch(() => null);
          throw new Error(body?.error ?? "Failed to delete photo.");
        }
        toast.success("Photo removed");
        router.refresh();
      } catch (err) {
        const message = err instanceof Error ? err.message : "Delete failed.";
        toast.error(message);
      }
    },
    [itemId, router, isCreateMode, onLocalMediaChange, media],
  );

  const handleSetPrimary = React.useCallback(
    async (mediaId: string) => {
      // Create mode: flip is_primary in local state.
      if (isCreateMode && onLocalMediaChange) {
        onLocalMediaChange(
          media.map((m) => ({ ...m, is_primary: m.id === mediaId })),
        );
        return;
      }
      try {
        const resp = await fetch("/api/items/media", {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ itemId, mediaId }),
        });
        if (!resp.ok) {
          const body = await resp.json().catch(() => null);
          throw new Error(body?.error ?? "Failed to set primary photo.");
        }
        toast.success("Primary photo updated");
        router.refresh();
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Failed to set primary photo.";
        toast.error(message);
      }
    },
    [itemId, router, isCreateMode, onLocalMediaChange, media],
  );

  /** Local optimistic order — set on dragEnd so the grid doesn't snap
   *  back during the PATCH roundtrip + router.refresh. Cleared once the
   *  next render arrives with fresh server data. */
  const [optimisticOrder, setOptimisticOrder] = React.useState<string[] | null>(
    null,
  );

  // Reset optimistic order whenever the parent passes a new media array.
  // Identity check is enough — parent re-creates from server data.
  const mediaRef = React.useRef(media);
  React.useEffect(() => {
    if (mediaRef.current !== media) {
      mediaRef.current = media;
      setOptimisticOrder(null);
    }
  }, [media]);

  const handleReorder = React.useCallback(
    async (newOrder: string[]) => {
      // Create mode: rebuild local media in the new order. Optimistic
      // order state is irrelevant since the rendered grid reads from
      // parent's media prop directly post-callback.
      if (isCreateMode && onLocalMediaChange) {
        const byId = new Map(media.map((m) => [m.id, m]));
        const reordered = newOrder
          .map((id) => byId.get(id))
          .filter((m): m is PhotoUploaderMedia => Boolean(m));
        onLocalMediaChange(reordered);
        setOptimisticOrder(null);
        return;
      }
      const positions = newOrder.map((id, index) => ({ id, position: index }));
      try {
        const resp = await fetch("/api/items/media", {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ itemId, positions }),
        });
        if (!resp.ok) {
          const body = await resp.json().catch(() => null);
          throw new Error(body?.error ?? "Failed to reorder photos.");
        }
        router.refresh();
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Failed to reorder photos.";
        toast.error(message);
        // On failure, drop the optimistic order so the UI snaps back
        // to the server's truth.
        setOptimisticOrder(null);
      }
    },
    [itemId, router],
  );

  // -----------------------------------------------------------------------
  // dnd-kit (photo reorder) — separate from the HTML5 dnd that handles
  // file drops for upload. The two event systems coexist on the same
  // wrapper because they listen for different events (pointer/touch vs
  // dragenter/dragover/drop with dataTransfer.types=Files).
  // -----------------------------------------------------------------------

  const dndSensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 250, tolerance: 5 },
    }),
  );

  const handleDndEnd = React.useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over || active.id === over.id) return;
      const currentOrder =
        optimisticOrder ?? mediaWithUrls.map((m) => m.id);
      const fromIdx = currentOrder.indexOf(String(active.id));
      const toIdx = currentOrder.indexOf(String(over.id));
      if (fromIdx === -1 || toIdx === -1) return;
      const next = arrayMove(currentOrder, fromIdx, toIdx);
      setOptimisticOrder(next);
      void handleReorder(next);
    },
    [optimisticOrder, mediaWithUrls, handleReorder],
  );

  // -----------------------------------------------------------------------
  // Drag-and-drop handlers
  //
  // Counter pattern: dragenter on a parent fires when entering ANY child;
  // dragleave fires when leaving. Naïve toggling flickers. Track a
  // counter so the highlight goes off only when we've fully left the
  // root element.
  // -----------------------------------------------------------------------

  const handleDragEnter = React.useCallback((e: React.DragEvent) => {
    if (!e.dataTransfer.types.includes("Files")) return;
    e.preventDefault();
    dragCounterRef.current += 1;
    setDragging(true);
  }, []);

  const handleDragOver = React.useCallback((e: React.DragEvent) => {
    if (!e.dataTransfer.types.includes("Files")) return;
    // preventDefault on dragover is what enables drop. Without it,
    // browsers refuse to fire onDrop on the element.
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
  }, []);

  const handleDragLeave = React.useCallback((e: React.DragEvent) => {
    if (!e.dataTransfer.types.includes("Files")) return;
    dragCounterRef.current = Math.max(0, dragCounterRef.current - 1);
    if (dragCounterRef.current === 0) setDragging(false);
  }, []);

  const handleDrop = React.useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      dragCounterRef.current = 0;
      setDragging(false);
      const files = Array.from(e.dataTransfer.files);
      if (files.length > 0) void handleFiles(files);
    },
    [handleFiles],
  );

  const openPicker = React.useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleInputChange = React.useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files ? Array.from(e.target.files) : [];
      if (files.length > 0) void handleFiles(files);
    },
    [handleFiles],
  );

  // -----------------------------------------------------------------------
  // Render — hidden input is shared between empty + populated states.
  // -----------------------------------------------------------------------

  const hiddenInput = (
    <input
      ref={fileInputRef}
      type="file"
      accept={ACCEPTED_MIME_ATTR}
      multiple
      className="hidden"
      onChange={handleInputChange}
    />
  );

  if (mediaWithUrls.length === 0 && uploadingCount === 0) {
    return (
      <div
        onDragEnter={handleDragEnter}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        {hiddenInput}
        <Empty
          className={cn(
            "border border-dashed p-6 transition-colors",
            dragging && "border-primary bg-primary/5",
          )}
        >
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <ImagePlus />
            </EmptyMedia>
            <EmptyTitle>No photos yet</EmptyTitle>
            <EmptyDescription>
              {dragging
                ? "Drop to upload"
                : "Drag photos here, or click to upload. Max 10 files, 10 MB each."}
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={openPicker}
            >
              Upload photos
            </Button>
          </EmptyContent>
        </Empty>
      </div>
    );
  }

  // When the merchant has just dropped a tile, render in optimistic
  // order; otherwise use the server's authoritative order.
  const orderedMedia = optimisticOrder
    ? optimisticOrder
        .map((id) => mediaWithUrls.find((m) => m.id === id))
        .filter((m): m is NonNullable<typeof m> => Boolean(m))
    : mediaWithUrls;

  return (
    <div
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className={cn(
        "rounded-md transition-colors",
        dragging && "bg-primary/5 ring-1 ring-primary",
      )}
    >
      {hiddenInput}
      <DndContext
        // Stable id avoids the dnd-kit SSR hydration mismatch on
        // aria-describedby. See canvas-with-selection for the long-form
        // explanation.
        id="photo-uploader-dnd"
        sensors={dndSensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDndEnd}
      >
        <div className="grid grid-cols-3 gap-2">
          <SortableContext
            items={orderedMedia.map((m) => m.id)}
            strategy={rectSortingStrategy}
          >
            {orderedMedia.map((m) => (
              <SortablePhotoTile
                key={m.id}
                id={m.id}
                url={m.url}
                isPrimary={m.is_primary}
                onDelete={() => handleDelete(m.id)}
                onSetPrimary={() => handleSetPrimary(m.id)}
              />
            ))}
          </SortableContext>
          {Array.from({ length: uploadingCount }).map((_, i) => (
            <UploadingTile key={`uploading-${i}`} />
          ))}
          <button
            type="button"
            onClick={openPicker}
            aria-label="Add photo"
            className={cn(
              "flex aspect-square w-full flex-col items-center justify-center gap-1 rounded-sm",
              "border border-dashed bg-muted/30 text-muted-foreground transition-colors",
              "hover:bg-muted/50 hover:text-foreground",
              "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
            )}
          >
            <Plus className="size-5" />
            <span className="text-xs">Add photo</span>
          </button>
        </div>
      </DndContext>
    </div>
  );
}

// ---------------------------------------------------------------------------
// PhotoTile — single existing image with hover overlay + 3-dot menu.
// ---------------------------------------------------------------------------

type SortablePhotoTileProps = {
  id: string;
  url: string | null;
  isPrimary: boolean;
  onDelete: () => void;
  onSetPrimary: () => void;
};

/**
 * SortablePhotoTile — single image with hover overlay (3-dot menu) AND
 * dnd-kit drag handle on the whole tile.
 *
 * Listeners attach to the tile root (not just a grip handle) — Square's
 * pattern + matches our LibraryRow whole-row drag. Pointer activation
 * gates at 5px (PointerSensor), so click events on the menu trigger
 * still resolve as clicks rather than triggering drag.
 */
function SortablePhotoTile({
  id,
  url,
  isPrimary,
  onDelete,
  onSetPrimary,
}: SortablePhotoTileProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    touchAction: "pan-y",
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className={cn(
        "group relative aspect-square w-full overflow-hidden rounded-sm bg-muted",
        !isDragging && "cursor-grab active:cursor-grabbing",
      )}
    >
      {url ? (
        <Image
          src={url}
          alt=""
          fill
          sizes="(max-width: 768px) 33vw, 250px"
          className="object-cover"
        />
      ) : null}
      {isPrimary && (
        <span className="absolute left-1 top-1 rounded-sm bg-background/90 px-1.5 py-0.5 text-[10px] font-medium text-foreground">
          Primary
        </span>
      )}
      <div className="absolute right-1 top-1 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              variant="secondary"
              size="icon"
              aria-label="Photo actions"
              className="size-7"
              // Stop pointer events from propagating to the parent
              // sortable listener — otherwise the menu open click can
              // get swallowed by the drag activation gate.
              onPointerDown={(e) => e.stopPropagation()}
            >
              <MoreVertical className="size-3.5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {!isPrimary && (
              <DropdownMenuItem onSelect={onSetPrimary}>
                <Star className="size-4" />
                Set as primary
              </DropdownMenuItem>
            )}
            <DropdownMenuItem
              onSelect={onDelete}
              className="text-destructive focus:text-destructive"
            >
              <Trash2 className="size-4" />
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// UploadingTile — placeholder rendered while an upload is in flight.
// One tile per in-flight file (uploadingCount). Replaces the global
// "Uploading..." spinner so the merchant sees per-file progress.
// ---------------------------------------------------------------------------

function UploadingTile() {
  return (
    <div
      className={cn(
        "flex aspect-square w-full items-center justify-center rounded-sm",
        "border border-dashed bg-muted/30 text-muted-foreground",
      )}
      aria-label="Uploading photo"
      aria-busy="true"
    >
      <Loader2 className="size-5 animate-spin" />
    </div>
  );
}
