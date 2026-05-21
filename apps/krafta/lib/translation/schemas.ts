/**
 * Zod schemas + types for the translation worker's AI SDK call.
 *
 * The worker calls `generateText({ output: Output.object({ schema }) })`
 * where `schema` is built per-job by `outputSchemaFor()` based on which
 * fields the entity actually has. AI SDK v6 enforces the schema via
 * OpenAI's strict structured outputs — invalid JSON → NoObjectGeneratedError
 * → job marked failed → exponential backoff retry.
 *
 * Entity → fields mapping (matches the design doc table):
 *   item          → name, description, image_alt
 *   variation     → name
 *   modifier      → name
 *   modifier_list → name
 *   category      → name, description
 *   catalog       → name, description  (Phase 2 — not used in Phase 1)
 *
 * Only `name` is required. `description` + `image_alt` are nullable
 * (Output.object respects null inputs and returns null outputs per the
 * prompt's Rule 6).
 */

import { z } from "zod";

// =============================================================================
// Entity kinds — keep aligned with the public.translatable_entity_kind enum
// =============================================================================

/**
 * Phase 1 entity kinds — matches the public.translatable_entity_kind enum in
 * the database. "catalog" (shop meta translation) is Phase 2 scope; adding it
 * here would also require an enum ALTER + new catalog_translations table.
 */
export const ENTITY_KINDS = [
  "item",
  "variation",
  "modifier",
  "modifier_list",
  "category",
] as const;

export type EntityKind = (typeof ENTITY_KINDS)[number];

// =============================================================================
// Per-entity field maps
// =============================================================================

/** Field keys each entity kind exposes for translation. */
export const FIELDS_BY_ENTITY: Record<EntityKind, readonly string[]> = {
  item: ["name", "description", "image_alt"],
  variation: ["name"],
  modifier: ["name"],
  modifier_list: ["name"],
  category: ["name", "description"],
} as const;

/** Which fields are nullable in the output. `name` is always required. */
const NULLABLE_FIELDS = new Set(["description", "image_alt"]);

// =============================================================================
// Output schema builder
// =============================================================================

/**
 * Build a Zod schema for the AI worker's translation output, restricted to
 * the keys the entity actually has. Used as `Output.object({ schema })` in
 * the `generateText()` call.
 *
 * Returns the shape:
 *   { fields: { [key]: string } }   // for required-only fields
 *   { fields: { [key]: string | null } }  // for nullable fields
 *
 * Examples:
 *   outputSchemaFor("variation") → z.object({ fields: z.object({ name: z.string() }) })
 *   outputSchemaFor("item")      → z.object({ fields: z.object({ name: z.string(), description: z.string().nullable(), image_alt: z.string().nullable() }) })
 */
export function outputSchemaFor(entityKind: EntityKind) {
  const fields = FIELDS_BY_ENTITY[entityKind];
  const shape: Record<string, z.ZodTypeAny> = {};
  for (const key of fields) {
    shape[key] = NULLABLE_FIELDS.has(key)
      ? z.string().nullable()
      : z.string();
  }
  return z.object({
    fields: z.object(shape),
  });
}

// =============================================================================
// Input shape (what the worker sends in the user message)
// =============================================================================

/**
 * Sent as `prompt: JSON.stringify(input)` to `generateText()`. The system
 * prompt describes this shape so the model knows what it's receiving.
 */
export type TranslationInput = {
  entity_kind: EntityKind;
  source_locale: string;
  target_locale: string;
  fields: Record<string, string | null>;
};

/**
 * Result returned by `outputSchemaFor(entityKind).parse(...)`. Worker reads
 * `.fields` and persists to the appropriate translation table.
 */
export type TranslationOutput = {
  fields: Record<string, string | null>;
};
