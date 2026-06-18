// Menu extraction — vision model call (Vercel AI SDK v6).
//
// Reads one or more uploaded files (photos / screenshots / PDF pages) of a
// merchant's existing menu and returns a structured menu. Built on the same
// `generateText` + `Output.object` pattern as the translation worker
// (lib/translation/actions.ts); the only new ingredient is multimodal input —
// image/file message parts, per the AI SDK docs (foundations/prompts).
//
// Provider: OpenAI direct via the AI SDK — the same provider that powers
// translations, authenticated with OPENAI_API_KEY. No Vercel AI Gateway, so
// billing stays on our own OpenAI account and stays predictable. Tune the model
// for cost vs accuracy with MENU_EXTRACTION_MODEL (default gpt-5-nano — the
// cheapest GPT-5, and it accepts image input; bump to gpt-5.4-mini or gpt-5.4
// if quality on messy/handwritten menus falls short). Any GPT-5 / GPT-4o family
// model takes images; the *-nano tiers just trade some vision accuracy for
// price. Same model the translation worker uses.

import "server-only";

import { createOpenAI } from "@ai-sdk/openai";
import { generateText, Output, type LanguageModel } from "ai";
import convert from "heic-convert";

import { extractedMenuSchema, type ExtractedMenu } from "./schema";

const MODEL_ID = process.env.MENU_EXTRACTION_MODEL ?? "gpt-5-nano-2025-08-07";

function resolveVisionModel(): LanguageModel | null {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;
  return createOpenAI({ apiKey })(MODEL_ID);
}

const SYSTEM_PROMPT = `You read a restaurant or shop menu from one or more photos, screenshots, or PDF pages and return its structure as data.

Rules:
- Treat ALL provided files as pages of ONE menu. Merge them; never list the same item twice.
- Extract every distinct sellable item. For each: its name, a short description ONLY if one is printed, and its price.
- price: the numeric value printed next to the item, with no currency symbol and no thousands separators ("25 000 сум" -> 25000, "$4.50" -> 4.5). If no price is legible for an item, use null. Never invent a price.
- Keep names and descriptions in the menu's ORIGINAL language, exactly as written. Do not translate, correct spelling, or rephrase.
- Group items under the section/category headings shown on the menu (e.g. Coffee, Salads, Drinks). If the menu has no headings, put everything in one section named "Menu".
- Ignore anything that is not a sellable item: addresses, phone numbers, opening hours, wifi passwords, slogans, social handles, allergen legends, page numbers.
- If a file is not a menu or is unreadable, return empty sections rather than guessing.`;

export type MenuFileInput = {
  bytes: Uint8Array;
  mediaType: string;
  filename?: string;
};

function isHeic(f: MenuFileInput): boolean {
  return (
    f.mediaType === "image/heic" ||
    f.mediaType === "image/heif" ||
    /\.(heic|heif)$/i.test(f.filename ?? "")
  );
}

// OpenAI vision accepts PNG/JPEG/WebP/GIF — not HEIC. iPhone photos are HEIC
// unless the browser already transcoded them, so convert HEIC → JPEG here.
// Centralized in the lib so every caller (onboarding now, the assistant later)
// gets iPhone support for free.
async function normalizeForModel(f: MenuFileInput): Promise<MenuFileInput> {
  if (!isHeic(f)) return f;
  const jpeg = await convert({
    buffer: Buffer.from(f.bytes),
    format: "JPEG",
    quality: 0.9,
  });
  return {
    bytes: new Uint8Array(jpeg),
    mediaType: "image/jpeg",
    filename: `${(f.filename ?? "photo").replace(/\.(heic|heif)$/i, "")}.jpg`,
  };
}

/**
 * Extract a structured menu from uploaded files. Throws on configuration or
 * model failure — callers (the onboarding action, the future assistant tool)
 * decide how to surface it.
 */
export async function extractMenu(
  files: MenuFileInput[],
  opts?: { signal?: AbortSignal },
): Promise<ExtractedMenu> {
  const model = resolveVisionModel();
  if (!model) {
    throw new Error("OPENAI_API_KEY is not set.");
  }

  const normalized = await Promise.all(files.map(normalizeForModel));
  const fileParts = normalized.map((f) =>
    f.mediaType === "application/pdf"
      ? {
          type: "file" as const,
          mediaType: f.mediaType,
          data: f.bytes,
          filename: f.filename,
        }
      : { type: "image" as const, image: f.bytes },
  );

  const { output } = await generateText({
    model,
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "text" as const,
            text: "Read this menu and return its sections and items.",
          },
          ...fileParts,
        ],
      },
    ],
    output: Output.object({ schema: extractedMenuSchema }),
    // A full menu of items is a few thousand tokens; give it headroom.
    maxOutputTokens: 8000,
    // 60s ceiling — vision over several images is slower than text; still well
    // under Vercel's default server-action limit.
    abortSignal: opts?.signal ?? AbortSignal.timeout(60_000),
  });

  return output;
}
