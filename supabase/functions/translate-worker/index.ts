/**
 * Localization Workbench — AI translation worker.
 *
 * Supabase Edge Function (Deno). Invoked every minute by pg_cron via
 * pg_net.http_post with a service-role JWT.
 *
 * Flow per tick:
 *   1. pg_try_advisory_lock — abort if another tick is mid-batch
 *   2. Watchdog — re-queue jobs stuck in 'running' for >5min
 *   3. Claim up to 50 jobs from translation_jobs (FOR UPDATE SKIP LOCKED)
 *      where status IN ('queued','failed') AND next_attempt_at <= now()
 *   4. Process in parallel batches of 10 via translateOne()
 *      - Fetch source fields + default locale + current_source_hash from parent
 *      - Call OpenAI via AI SDK v6 (generateText + Output.object + Zod)
 *      - Conditional upsert with human-edit guard
 *      - Mark job done / skipped / failed
 *   5. Revalidate customer-facing cache for each touched catalog
 *   6. Release advisory lock
 *
 * Companion design doc + prompt artifact:
 *   ~/.gstack/projects/mamaevbakh-krafta/bakh-dev-design-localization-workbench-20260521-161254.md
 *   ~/.gstack/projects/mamaevbakh-krafta/localization-workbench-translation-prompt.md
 *
 * Linear: KRA-91 (Slice 2 of KRA-89 epic).
 */

// Deno npm: specifiers — Supabase Edge Functions bundle these via esbuild.
import { generateText, Output } from "npm:ai@^6";
import { createOpenAI } from "npm:@ai-sdk/openai@^3";
import {
  createClient,
  type SupabaseClient,
} from "npm:@supabase/supabase-js@^2";
import { z } from "npm:zod@^4";

// ============================================================================
// System prompt (mirror of apps/krafta/lib/translation/prompt.ts —
// kept inline because Deno edge functions can't easily import from the
// Next.js app's module graph)
// ============================================================================

const SYSTEM_PROMPT = `You translate food and beverage catalog content for Krafta, a SaaS dashboard for restaurants and cafes. Your output goes directly to a customer-facing menu — accuracy and natural target-language tone are mandatory.

# Locale conventions

Translate from \`source_locale\` to \`target_locale\`. Use the script implied by the locale code:
- \`uz-Latn\` or bare \`uz\` → Latin Uzbek (modern official script since 2023): "qahva", "non", "go'sht"
- \`uz-Cyrl\` → Cyrillic Uzbek (older but still used): "қаҳва", "нон"
- \`ru\` → Russian Cyrillic
- \`en\` → English
- \`tg\` or \`tg-Cyrl\` → Tajik Cyrillic
- \`kk-Latn\` → Kazakh Latin, \`kk-Cyrl\` → Kazakh Cyrillic
- \`ky\` → Kyrgyz Cyrillic
- \`ar\` → Modern Standard Arabic (RTL — output bare text, no markup)
- \`fa\` → Persian Farsi (RTL)
- Other ISO codes → use the modern, professional written standard for that locale

# Rules

1. **Proper nouns stay unchanged.** Brand names (Coca-Cola, Pepsi, Starbucks, McDonald's, Nestle), branded dish names (Big Mac, Frappuccino, Whopper), and place names (Tashkent, Samarkand, Москва) carry over as-is. Transliterate ONLY when the original would be unreadable in the target script AND a well-established local spelling exists.

2. **Cuisine terms keep their internationally-recognized form.** Do not translate dish names into literal calques:
   - "Капучино" (ru) → "Cappuccino" (en), "Kapuchino" (uz-Latn). NOT "milky coffee".
   - "Плов" (ru) → "Plov" (en), "Palov" (uz-Latn). NOT "rice dish".
   - "Самса" → "Samsa" everywhere. NOT "meat pastry".
   - "Лагман" → "Lagman" everywhere.

3. **Numbers and units carry over exactly.** Sizes, weights, percentages, calories preserve their values. Convert ONLY the unit suffix to the locale-standard form ("200 г" → "200 g" in en/uz-Latn; "200 جم" in ar).

4. **Natural tone, not word-for-word.** Translate for a real customer reading a menu in their language. Avoid robotic literal translations.

5. **Multi-language source = single-language target.** If the source field is mixed ("Coffee Кофе Qahva"), translate based on \`source_locale\` only.

6. **Null fields return null.** If a field is null or empty, return null. Never fabricate.

7. **No additions.** Do not add ingredients, marketing language, or details not in the source.

8. **Confidence guard.** If you cannot translate a term confidently, preserve the original term unchanged rather than guessing.

9. **Output is JSON only.** No prose, no markdown, no apology, no explanation.

## Examples

### ru → uz-Latn
INPUT:  {"entity_kind":"item","source_locale":"ru","target_locale":"uz-Latn","fields":{"name":"Кофе Латте","description":"Кофейный напиток с молоком, 250 мл"}}
OUTPUT: {"fields":{"name":"Latte qahvasi","description":"Sutli qahva ichimligi, 250 ml"}}

### ru → en (cuisine term — keep international name)
INPUT:  {"entity_kind":"item","source_locale":"ru","target_locale":"en","fields":{"name":"Плов с бараниной","description":"Узбекский плов с куском баранины и морковью"}}
OUTPUT: {"fields":{"name":"Lamb Plov","description":"Uzbek plov with a piece of lamb and carrots"}}

### ru → en (brand name preserved + null description)
INPUT:  {"entity_kind":"item","source_locale":"ru","target_locale":"en","fields":{"name":"Кока-Кола Зеро","description":null}}
OUTPUT: {"fields":{"name":"Coca-Cola Zero","description":null}}

### ru → uz-Latn (variation — name only)
INPUT:  {"entity_kind":"variation","source_locale":"ru","target_locale":"uz-Latn","fields":{"name":"Маленький"}}
OUTPUT: {"fields":{"name":"Kichik"}}

### en → ar (RTL output, plain text)
INPUT:  {"entity_kind":"modifier","source_locale":"en","target_locale":"ar","fields":{"name":"Extra cheese"}}
OUTPUT: {"fields":{"name":"جبنة إضافية"}}

### Mixed-language source (filter noise)
INPUT:  {"entity_kind":"item","source_locale":"ru","target_locale":"en","fields":{"name":"Coffee Кофе Qahva","description":"Кофейный напиток"}}
OUTPUT: {"fields":{"name":"Coffee","description":"Coffee drink"}}

### Confidence guard (regional term — preserve)
INPUT:  {"entity_kind":"item","source_locale":"uz-Latn","target_locale":"en","fields":{"name":"Norin","description":"An'anaviy o'zbek taomi"}}
OUTPUT: {"fields":{"name":"Norin","description":"Traditional Uzbek dish"}}`;

// ============================================================================
// Per-entity schema + table maps
// ============================================================================

type EntityKind =
  | "item"
  | "variation"
  | "modifier"
  | "modifier_list"
  | "category"
  | "catalog";

const FIELDS_BY_ENTITY: Record<EntityKind, readonly string[]> = {
  item: ["name", "description", "image_alt"],
  variation: ["name"],
  modifier: ["name"],
  modifier_list: ["name"],
  category: ["name", "description"],
  // KRA-98: catalog meta translation = the storefront's shop name +
  // description. One row per catalog (no child entity), so the worker's
  // "parent row" IS the catalog itself.
  catalog: ["name", "description"],
};

const NULLABLE_FIELDS = new Set(["description", "image_alt"]);

const TRANSLATION_TABLE: Record<EntityKind, string> = {
  item: "item_translations",
  variation: "variation_translations",
  modifier: "modifier_translations",
  modifier_list: "modifier_list_translations",
  category: "catalog_category_translations",
  catalog: "catalog_translations",
};

const PARENT_TABLE: Record<EntityKind, string> = {
  item: "items",
  variation: "item_variations",
  modifier: "modifiers",
  modifier_list: "modifier_lists",
  category: "catalog_categories",
  catalog: "catalogs",
};

const TRANSLATION_PK_COLUMN: Record<EntityKind, string> = {
  item: "item_id",
  variation: "item_variation_id",
  modifier: "modifier_id",
  modifier_list: "modifier_list_id",
  category: "category_id",
  // For catalog meta the FK back to the parent IS the catalog_id — see
  // catalog_translations.catalog_id in 20260522110000_kra98_catalog_translations.sql.
  catalog: "catalog_id",
};

function outputSchemaFor(entityKind: EntityKind) {
  const fields = FIELDS_BY_ENTITY[entityKind];
  const shape: Record<string, z.ZodTypeAny> = {};
  for (const key of fields) {
    shape[key] = NULLABLE_FIELDS.has(key) ? z.string().nullable() : z.string();
  }
  return z.object({ fields: z.object(shape) });
}

// ============================================================================
// Worker types
// ============================================================================

type Job = {
  id: string;
  catalog_id: string;
  target_locale: string;
  entity_kind: EntityKind;
  entity_id: string;
  attempts: number;
  max_attempts: number;
  llm_provider: string;
};

type SourceFetch = {
  defaultLocale: string;
  sourceHash: string; // hex-encoded bytea from current_source_hash
  fields: Record<string, string | null>;
};

// ============================================================================
// Source fetching
// ============================================================================

/**
 * Fetch the source-locale field values for the entity AND the catalog's
 * default locale AND the parent's current_source_hash. Returns null if the
 * parent row no longer exists (treat as orphan — job will be marked failed).
 */
async function fetchSourceFields(
  supabase: SupabaseClient,
  job: Job,
): Promise<SourceFetch | null> {
  // First: get the catalog's default locale.
  const { data: defaultLocaleRow, error: localeErr } = await supabase
    .from("catalog_locales")
    .select("locale")
    .eq("catalog_id", job.catalog_id)
    .eq("is_default", true)
    .maybeSingle();

  if (localeErr || !defaultLocaleRow) return null;
  const defaultLocale = defaultLocaleRow.locale;

  // Second: get the parent entity row.
  const parentTable = PARENT_TABLE[job.entity_kind];
  const fieldsNeeded = FIELDS_BY_ENTITY[job.entity_kind];
  const selectCols = [...fieldsNeeded, "current_source_hash"].join(", ");

  const { data: parentRow, error: parentErr } = await supabase
    .from(parentTable)
    .select(selectCols)
    .eq("id", job.entity_id)
    .maybeSingle();

  if (parentErr || !parentRow) return null;

  // Bytea comes back from Supabase JS as hex-encoded string (e.g. "\\xabcd...").
  // Store as-is and compare via SQL when writing — we just shuttle it through.
  const sourceHash = parentRow.current_source_hash as string;

  const fields: Record<string, string | null> = {};
  for (const key of fieldsNeeded) {
    const value = (parentRow as Record<string, unknown>)[key];
    fields[key] = typeof value === "string" ? value : null;
  }

  return { defaultLocale, sourceHash, fields };
}

// ============================================================================
// Translation write (with human-edit guard)
// ============================================================================

/**
 * Returns "written" if the row was inserted/updated, "skipped" if a human
 * edit was preserved.
 */
async function writeTranslationWithGuard(
  supabase: SupabaseClient,
  job: Job,
  source: SourceFetch,
  translated: Record<string, string | null>,
): Promise<"written" | "skipped"> {
  const table = TRANSLATION_TABLE[job.entity_kind];
  const fkCol = TRANSLATION_PK_COLUMN[job.entity_kind];

  // Check for existing translation row + its edit status.
  const { data: existing } = await supabase
    .from(table)
    .select("id, is_ai_translated, last_edited_by")
    .eq(fkCol, job.entity_id)
    .eq("locale", job.target_locale)
    .maybeSingle();

  // Human-edit guard: human-edited rows are sacrosanct.
  if (
    existing &&
    !existing.is_ai_translated &&
    existing.last_edited_by !== null
  ) {
    return "skipped";
  }

  const rowFields: Record<string, unknown> = {};
  for (const key of FIELDS_BY_ENTITY[job.entity_kind]) {
    rowFields[key] = translated[key];
  }

  if (existing) {
    const { error } = await supabase
      .from(table)
      .update({
        ...rowFields,
        source_hash: source.sourceHash,
        is_ai_translated: true,
        last_edited_by: null,
      })
      .eq("id", existing.id);
    if (error) throw new Error(`update failed: ${error.message}`);
  } else {
    const { error } = await supabase.from(table).insert({
      [fkCol]: job.entity_id,
      locale: job.target_locale,
      ...rowFields,
      source_hash: source.sourceHash,
      is_ai_translated: true,
      last_edited_by: null,
    });
    if (error) throw new Error(`insert failed: ${error.message}`);
  }

  return "written";
}

// ============================================================================
// Job state transitions
// ============================================================================

async function markJobDone(supabase: SupabaseClient, jobId: string) {
  await supabase
    .from("translation_jobs")
    .update({ status: "done", completed_at: new Date().toISOString() })
    .eq("id", jobId);
}

async function markJobSkipped(
  supabase: SupabaseClient,
  jobId: string,
  reason: string,
) {
  await supabase
    .from("translation_jobs")
    .update({
      status: "skipped",
      error_text: reason,
      completed_at: new Date().toISOString(),
    })
    .eq("id", jobId);
}

async function markJobFailed(
  supabase: SupabaseClient,
  jobId: string,
  errorMsg: string,
  attempts: number,
  maxAttempts: number,
) {
  // Exponential backoff: 1m, 5m, 25m. Past max_attempts → status='dead'.
  const backoffMinutes = Math.pow(5, attempts);
  const nextAttemptAt = new Date(Date.now() + backoffMinutes * 60_000);

  await supabase
    .from("translation_jobs")
    .update({
      status: attempts >= maxAttempts ? "dead" : "failed",
      error_text: errorMsg.slice(0, 2000),
      next_attempt_at: nextAttemptAt.toISOString(),
    })
    .eq("id", jobId);
}

async function incrementQuotaUsage(
  supabase: SupabaseClient,
  catalogId: string,
  tokensUsed: number,
) {
  // Estimate USD: gpt-5-nano-2025-08-07 is $0.05/M input, $0.4/M output.
  // We don't have a split here; use a blended ~$0.20/M as a rough estimate.
  // Phase 1 just needs ballpark cost tracking; precise input/output split
  // can come later if costs matter.
  const usdEstimated = (tokensUsed / 1_000_000) * 0.2;

  // Upsert with increment via a raw SQL call. Supabase JS doesn't expose
  // atomic increments natively; use rpc.
  await supabase.rpc("increment_translation_quota", {
    p_catalog_id: catalogId,
    p_tokens_used: tokensUsed,
    p_usd_estimated: usdEstimated,
  });
}

// ============================================================================
// translateOne — process a single job
// ============================================================================

async function translateOne(
  supabase: SupabaseClient,
  openai: ReturnType<typeof createOpenAI>,
  job: Job,
): Promise<void> {
  try {
    const source = await fetchSourceFields(supabase, job);
    if (!source) {
      throw new Error("SOURCE_NOT_FOUND");
    }

    // AI SDK v6 call — structured output via Zod.
    const result = await generateText({
      model: openai("gpt-5-nano-2025-08-07"),
      system: SYSTEM_PROMPT,
      prompt: JSON.stringify({
        entity_kind: job.entity_kind,
        source_locale: source.defaultLocale,
        target_locale: job.target_locale,
        fields: source.fields,
      }),
      output: Output.object({ schema: outputSchemaFor(job.entity_kind) }),
      temperature: 0.2,
      maxOutputTokens: 2000,
      providerOptions: {
        openai: { reasoningEffort: "minimal" },
      },
      abortSignal: AbortSignal.timeout(20_000),
    });

    const translated = result.output.fields;
    const tokensUsed = result.usage?.totalTokens ?? 0;

    const outcome = await writeTranslationWithGuard(
      supabase,
      job,
      source,
      translated,
    );

    if (outcome === "skipped") {
      await markJobSkipped(supabase, job.id, "HUMAN_EDIT_PROTECTED");
      // Quota NOT incremented — no AI write landed.
      return;
    }

    await markJobDone(supabase, job.id);
    await incrementQuotaUsage(supabase, job.catalog_id, tokensUsed);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await markJobFailed(
      supabase,
      job.id,
      msg,
      job.attempts,
      job.max_attempts,
    );
  }
}

// ============================================================================
// runBatch — claim a batch + process + revalidate
// ============================================================================

const BATCH_SIZE = 50;
const PARALLELISM = 10;
const ADVISORY_LOCK_KEY = "translate-worker";

async function runBatch(
  supabase: SupabaseClient,
  openai: ReturnType<typeof createOpenAI>,
  siteUrl: string | undefined,
): Promise<{ claimed: number; outcome: string }> {
  // 0. Singleton advisory lock.
  const { data: lockData } = await supabase.rpc("pg_try_advisory_lock_text", {
    p_key: ADVISORY_LOCK_KEY,
  });
  if (!lockData) {
    return { claimed: 0, outcome: "skipped:lock-held" };
  }

  try {
    // 1a. Watchdog — re-queue stuck-running jobs.
    await supabase.rpc("translation_worker_watchdog");

    // 1b. Claim jobs.
    const { data: claimedJobs, error: claimErr } = await supabase.rpc(
      "translation_worker_claim_batch",
      { p_batch_size: BATCH_SIZE },
    );

    if (claimErr) {
      console.error("claim failed", claimErr);
      return { claimed: 0, outcome: `error:claim:${claimErr.message}` };
    }

    const jobs = (claimedJobs ?? []) as Job[];
    if (jobs.length === 0) {
      return { claimed: 0, outcome: "no-work" };
    }

    // 2. Process in parallel batches.
    for (let i = 0; i < jobs.length; i += PARALLELISM) {
      const slice = jobs.slice(i, i + PARALLELISM);
      await Promise.allSettled(slice.map((job) => translateOne(supabase, openai, job)));
    }

    // 3. Revalidate customer-facing cache per touched catalog.
    if (siteUrl) {
      const touchedCatalogs = Array.from(
        new Set(jobs.map((j) => j.catalog_id)),
      );
      const serviceRoleJwt = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
      await Promise.allSettled(
        touchedCatalogs.map((catalogId) =>
          fetch(`${siteUrl}/api/internal/revalidate-catalog`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${serviceRoleJwt}`,
            },
            body: JSON.stringify({ catalogId }),
          }).catch(() => undefined),
        ),
      );
    }

    return { claimed: jobs.length, outcome: "ok" };
  } finally {
    await supabase.rpc("pg_advisory_unlock_text", {
      p_key: ADVISORY_LOCK_KEY,
    });
  }
}

// ============================================================================
// HTTP handler
// ============================================================================

Deno.serve(async (req) => {
  // Only allow service-role-authenticated POST requests.
  if (req.method !== "POST") {
    return new Response("method not allowed", { status: 405 });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const openaiKey = Deno.env.get("OPENAI_API_KEY");
  const siteUrl = Deno.env.get("KRAFTA_SITE_URL"); // e.g. https://app.krafta.studio

  if (!supabaseUrl || !serviceRoleKey || !openaiKey) {
    return new Response(
      JSON.stringify({
        error: "missing env",
        missing: {
          SUPABASE_URL: !supabaseUrl,
          SUPABASE_SERVICE_ROLE_KEY: !serviceRoleKey,
          OPENAI_API_KEY: !openaiKey,
        },
      }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const openai = createOpenAI({ apiKey: openaiKey });

  const result = await runBatch(supabase, openai, siteUrl);

  return new Response(JSON.stringify(result), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
});
