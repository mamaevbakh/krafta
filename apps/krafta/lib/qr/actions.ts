"use server";

/**
 * QR studio server actions.
 *
 * The studio is a client island on /dashboard/[org]/[catalog]/qr-codes —
 * it owns its own draft state, debounces a live preview against the
 * pure `renderQrSvg` (shared with SSR), and POSTs the normalized
 * `QrStyleConfig` here when the merchant clicks Save.
 *
 * Auth: every action uses the request-scoped Supabase client, which
 * carries the merchant's session. RLS on public.catalogs enforces
 * owner/admin write — no service-role escape.
 */

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/types";

import {
  qrStyleConfigSchema,
  type QrStyleConfig,
} from "./config";

const saveQrStyleSchema = z.object({
  catalogId: z.string().uuid(),
  catalogSlug: z.string().min(1),
  // The studio sends a fully-normalized config — but we still re-parse
  // through qrStyleConfigSchema server-side as a defense-in-depth check
  // against malformed payloads (truncated, edited in transit, etc.).
  style: qrStyleConfigSchema,
});

export type SaveQrStyleResult =
  | { ok: true; style: QrStyleConfig }
  | { ok: false; error: string };

export async function saveQrStyle(
  input: z.input<typeof saveQrStyleSchema>,
): Promise<SaveQrStyleResult> {
  const parsed = saveQrStyleSchema.safeParse(input);
  if (!parsed.success) {
    const message = parsed.error.issues[0]?.message ?? "Invalid QR style.";
    return { ok: false, error: message };
  }
  const { catalogId, catalogSlug, style } = parsed.data;

  const supabase = await createClient();

  // settings_qr_style is jsonb. The zod-parsed object IS valid JSON; the
  // generated `Json` type for the column is a recursive union that
  // doesn't accept arbitrary objects directly, so we cast to its named
  // type once at the boundary. Postgres validates on the way in and the
  // subsequent read returns the same shape we wrote.
  const { error } = await supabase
    .from("catalogs")
    .update({
      settings_qr_style: style as unknown as Database["public"]["Tables"]["catalogs"]["Update"]["settings_qr_style"],
    })
    .eq("id", catalogId);

  if (error) {
    return { ok: false, error: error.message };
  }

  // Revalidate every surface that pre-renders QR SVGs from this catalog
  // so the new style takes effect without a hard refresh.
  revalidatePath(`/dashboard/[orgSlug]/${catalogSlug}/qr-codes`, "page");
  revalidatePath(`/dashboard/[orgSlug]/${catalogSlug}/settings`, "page");

  return { ok: true, style };
}

const resetQrStyleSchema = z.object({
  catalogId: z.string().uuid(),
  catalogSlug: z.string().min(1),
});

export async function resetQrStyle(
  input: z.input<typeof resetQrStyleSchema>,
): Promise<SaveQrStyleResult> {
  const parsed = resetQrStyleSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "Invalid input." };
  }
  const { catalogId, catalogSlug } = parsed.data;
  const supabase = await createClient();
  const { error } = await supabase
    .from("catalogs")
    .update({
      settings_qr_style: {} as unknown as Database["public"]["Tables"]["catalogs"]["Update"]["settings_qr_style"],
    })
    .eq("id", catalogId);
  if (error) {
    return { ok: false, error: error.message };
  }
  revalidatePath(`/dashboard/[orgSlug]/${catalogSlug}/qr-codes`, "page");
  revalidatePath(`/dashboard/[orgSlug]/${catalogSlug}/settings`, "page");
  return { ok: true, style: qrStyleConfigSchema.parse({}) };
}

/**
 * Upload a merchant's logo image to the `krafta` storage bucket under
 * `qr-logos/{catalogId}/{nanoid}.{ext}`. Returns the public URL so the
 * studio can use it as the `logo.src` in the QrStyleConfig.
 *
 * The action accepts a base64-encoded data URL (the studio reads the
 * File via FileReader and posts the dataURL string here). Keeping the
 * dataURL hop avoids needing to thread the binary through a multipart
 * Next.js server-action wrapper.
 */
const uploadQrLogoSchema = z.object({
  catalogId: z.string().uuid(),
  // The studio limits client-side to ~512 KB, but enforce a hard cap
  // server-side too. Base64 inflates by ~33%, so ~700 KB is a safe
  // hard ceiling for a 512 KB binary.
  dataUrl: z.string().max(900_000),
});

export type UploadQrLogoResult =
  | { ok: true; src: string }
  | { ok: false; error: string };

export async function uploadQrLogo(
  input: z.input<typeof uploadQrLogoSchema>,
): Promise<UploadQrLogoResult> {
  const parsed = uploadQrLogoSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "Invalid logo upload." };
  }
  const { catalogId, dataUrl } = parsed.data;

  const match = dataUrl.match(/^data:(image\/(png|jpeg|svg\+xml|webp));base64,(.+)$/);
  if (!match) {
    return {
      ok: false,
      error: "Only PNG, JPEG, SVG, or WEBP images are accepted.",
    };
  }
  const mime = match[1];
  const ext =
    mime === "image/svg+xml"
      ? "svg"
      : mime === "image/jpeg"
        ? "jpg"
        : mime === "image/webp"
          ? "webp"
          : "png";
  const b64 = match[3];
  const bytes = Buffer.from(b64, "base64");
  if (bytes.byteLength > 512 * 1024) {
    return { ok: false, error: "Logo must be 512 KB or smaller." };
  }

  const supabase = await createClient();

  // Use a UUID-like random suffix so re-uploads don't overwrite each
  // other (we want CDN-cacheable URLs).
  const id = randomId(12);
  const objectPath = `qr-logos/${catalogId}/${id}.${ext}`;

  const { error: uploadError } = await supabase.storage
    .from("krafta")
    .upload(objectPath, bytes, {
      contentType: mime,
      upsert: false,
    });
  if (uploadError) {
    return {
      ok: false,
      error: uploadError.message ?? "Could not upload logo.",
    };
  }

  const { data: publicUrl } = supabase.storage
    .from("krafta")
    .getPublicUrl(objectPath);

  return { ok: true, src: publicUrl.publicUrl };
}

function randomId(len: number): string {
  // crypto.randomUUID-free path so this works on every Node version
  // Vercel ships. 36-char alphabet → 36^len possibilities.
  const ALPHABET = "abcdefghijklmnopqrstuvwxyz0123456789";
  let out = "";
  // crypto.getRandomValues is available in the Vercel Node runtime.
  const bytes = new Uint8Array(len);
  if (typeof globalThis.crypto?.getRandomValues === "function") {
    globalThis.crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < len; i += 1) {
      bytes[i] = Math.floor(Math.random() * 256);
    }
  }
  for (let i = 0; i < len; i += 1) {
    out += ALPHABET[bytes[i] % ALPHABET.length];
  }
  return out;
}
