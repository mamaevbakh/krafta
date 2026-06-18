"use server";

// Onboarding — "Upload files" menu extraction action.
//
// Thin server-action wrapper around lib/menu-extraction: it gates on a session
// (the wizard always runs with at least an anonymous Supabase user, so this is
// not an open vision endpoint), validates the uploaded files, and returns the
// structured menu for the wizard to drop into its review steps. The extraction
// itself lives in lib/menu-extraction/extract.ts so the future merchant
// assistant can reuse it as a tool without this onboarding wrapper.

import {
  extractMenu,
  type MenuFileInput,
} from "@/lib/menu-extraction/extract";
import type { ExtractedMenu } from "@/lib/menu-extraction/schema";
import { createClient } from "@/lib/supabase/server";

const MAX_FILES = 8;
const MAX_BYTES = 12 * 1024 * 1024; // 12 MB per file
const ALLOWED_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/heic",
  "image/heif",
  "application/pdf",
]);

// iPhone/HEIC files and some browsers send an empty MIME type — fall back to
// the filename extension so a real menu photo isn't rejected before we get the
// chance to convert it.
function resolveMediaType(file: File): string {
  if (file.type) return file.type;
  const ext = file.name.toLowerCase().match(/\.([a-z0-9]+)$/)?.[1];
  switch (ext) {
    case "heic":
      return "image/heic";
    case "heif":
      return "image/heif";
    case "jpg":
    case "jpeg":
      return "image/jpeg";
    case "png":
      return "image/png";
    case "webp":
      return "image/webp";
    case "pdf":
      return "application/pdf";
    default:
      return "application/octet-stream";
  }
}

export type ExtractMenuResult =
  | { ok: true; menu: ExtractedMenu }
  | { ok: false; error: string };

export async function extractMenuAction(
  formData: FormData,
): Promise<ExtractMenuResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Please reload and try again." };

  const files: MenuFileInput[] = [];
  for (const entry of formData.getAll("files")) {
    if (!(entry instanceof File)) continue;
    if (files.length >= MAX_FILES) break;
    if (entry.size === 0 || entry.size > MAX_BYTES) {
      return { ok: false, error: "Each file must be under 12 MB." };
    }
    const mediaType = resolveMediaType(entry);
    if (!ALLOWED_TYPES.has(mediaType)) {
      return {
        ok: false,
        error: "Upload photos (PNG, JPG, WebP, HEIC) or a PDF.",
      };
    }
    files.push({
      bytes: new Uint8Array(await entry.arrayBuffer()),
      mediaType,
      filename: entry.name,
    });
  }

  if (files.length === 0) {
    return { ok: false, error: "Add at least one photo or PDF of your menu." };
  }

  try {
    const menu = await extractMenu(files);
    const itemCount = menu.sections.reduce((n, s) => n + s.items.length, 0);
    if (itemCount === 0) {
      return {
        ok: false,
        error:
          "We couldn't find any items. Try a clearer photo, or add them manually.",
      };
    }
    return { ok: true, menu };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, error: `Couldn't read the menu: ${msg}` };
  }
}
