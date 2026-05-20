"use client";

/**
 * photo-uploader.tsx — KRA-88 Slice 1.
 *
 * Replaces the read-only Photos grid in the EditorSheet with an
 * editable uploader. Two states:
 *
 *   - EMPTY (no photos yet): shadcn Empty component with an ImagePlus
 *     icon, brief copy, and a "Upload photos" button. Click the button
 *     (or the dropzone) → opens the file picker.
 *
 *   - POPULATED (1+ photos): 3-column grid of thumbnails + a trailing
 *     "+ Add photo" tile (dashed border, same aspect ratio) that opens
 *     the same picker. Each tile has a hover overlay with a Delete
 *     action (3-dot menu).
 *
 * Upload flow:
 *   1. POST /api/items/media/upload-url with { itemId, orgId, catalogId,
 *      files: [{name, type, size}] }
 *      Returns: signed upload URLs + media ids + storage paths.
 *   2. For each upload, fetch(signedUrl, { method: PUT, body: file }).
 *      Track per-file status (uploading / success / error).
 *   3. POST /api/items/media to register the rows in item_media.
 *   4. router.refresh() to surface the new media in the page-level fetch.
 *
 * Slice 2 (separate PR): drag-reorder + primary toggle + per-image alt
 * text. This slice ships upload + display + delete only.
 *
 * Failure modes:
 *   - upload-url 4xx/5xx → toast.error, no rows registered
 *   - Storage PUT failure (network) → toast.error per-file, skip
 *     registration for failed uploads
 *   - register POST failure → toast.error, orphan upload exists in
 *     Storage (cleanup via /api/items/media/cleanup periodic job —
 *     out of scope here)
 */

import * as React from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { toast } from "sonner";
import { ImagePlus, Loader2, MoreVertical, Plus, Trash2 } from "lucide-react";

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

const ACCEPTED_MIME = "image/png,image/jpeg,image/webp,image/avif,image/heic,image/heif";

export type PhotoUploaderMedia = {
  id: string;
  bucket: string;
  storage_path: string;
  is_primary: boolean;
};

export type PhotoUploaderProps = {
  itemId: string;
  orgId: string;
  catalogId: string;
  media: PhotoUploaderMedia[];
};

export function PhotoUploader({
  itemId,
  orgId,
  catalogId,
  media,
}: PhotoUploaderProps) {
  const router = useRouter();
  const fileInputRef = React.useRef<HTMLInputElement | null>(null);
  const [uploading, setUploading] = React.useState(false);

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

  const openPicker = React.useCallback(() => {
    if (uploading) return;
    fileInputRef.current?.click();
  }, [uploading]);

  const handleFiles = React.useCallback(
    async (fileList: FileList | null) => {
      if (!fileList || fileList.length === 0) return;
      const files = Array.from(fileList);
      setUploading(true);
      try {
        // 1. Request signed upload URLs.
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

        // 2. PUT each file to its signed URL. Run in parallel; any
        //    individual failure becomes a toast — we still register the
        //    successful ones so the merchant doesn't lose successful
        //    uploads on a single bad file.
        const results = await Promise.all(
          uploads.map(async (upload, idx) => {
            try {
              const file = files[idx];
              const putResp = await fetch(upload.signedUrl, {
                method: "PUT",
                headers: file.type ? { "content-type": file.type } : undefined,
                body: file,
              });
              if (!putResp.ok) {
                throw new Error(`Upload failed (${putResp.status})`);
              }
              return { ok: true as const, upload };
            } catch (err) {
              const message = err instanceof Error ? err.message : "Upload failed.";
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

        if (successful.length === 0) {
          return; // every file failed; per-file toasts already fired
        }

        // 3. Register the successful uploads in item_media.
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
      } catch (err) {
        const message = err instanceof Error ? err.message : "Upload failed.";
        toast.error(message);
      } finally {
        setUploading(false);
        // Reset the file input so the same file can be re-selected.
        if (fileInputRef.current) {
          fileInputRef.current.value = "";
        }
      }
    },
    [itemId, orgId, catalogId, router],
  );

  const handleDelete = React.useCallback(
    async (mediaId: string) => {
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
    [itemId, router],
  );

  // Hidden file input — reused by both empty-state and add-tile triggers.
  const hiddenInput = (
    <input
      ref={fileInputRef}
      type="file"
      accept={ACCEPTED_MIME}
      multiple
      className="hidden"
      onChange={(e) => void handleFiles(e.target.files)}
    />
  );

  if (mediaWithUrls.length === 0) {
    return (
      <>
        {hiddenInput}
        <Empty className="border border-b p-0">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <ImagePlus />
            </EmptyMedia>
            <EmptyTitle>No photos yet</EmptyTitle>
            <EmptyDescription>
              Upload photos so customers can see what they're ordering.
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={openPicker}
              disabled={uploading}
            >
              {uploading ? (
                <Loader2 className="size-4 animate-spin" />
              ) : null}
              {uploading ? "Uploading…" : "Upload photos"}
            </Button>
          </EmptyContent>
        </Empty>
      </>
    );
  }

  return (
    <>
      {hiddenInput}
      <div className="grid grid-cols-3 gap-2">
        {mediaWithUrls.map((m) => (
          <PhotoTile
            key={m.id}
            url={m.url}
            isPrimary={m.is_primary}
            onDelete={() => handleDelete(m.id)}
          />
        ))}
        <button
          type="button"
          onClick={openPicker}
          disabled={uploading}
          aria-label="Add photo"
          className={cn(
            "flex aspect-square w-full flex-col items-center justify-center gap-1 rounded-sm",
            "border border-dashed bg-muted/30 text-muted-foreground transition-colors",
            "hover:bg-muted/50 hover:text-foreground",
            "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
            "disabled:cursor-not-allowed disabled:opacity-60",
          )}
        >
          {uploading ? (
            <Loader2 className="size-5 animate-spin" />
          ) : (
            <Plus className="size-5" />
          )}
          <span className="text-xs">
            {uploading ? "Uploading…" : "Add photo"}
          </span>
        </button>
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// PhotoTile — single image with hover overlay + 3-dot menu.
// ---------------------------------------------------------------------------

type PhotoTileProps = {
  url: string | null;
  isPrimary: boolean;
  onDelete: () => void;
};

function PhotoTile({ url, isPrimary, onDelete }: PhotoTileProps) {
  return (
    <div className="group relative aspect-square w-full overflow-hidden rounded-sm bg-muted">
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
            >
              <MoreVertical className="size-3.5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
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
