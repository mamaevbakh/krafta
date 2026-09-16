# tasnif

`tasnif.krafta.uz` — a free, open search over Uzbekistan's national product and service catalog (IKPU / MXIK codes). Not launched yet.

Every fiscal receipt and e-invoice in Uzbekistan must carry the 17-digit IKPU of what was sold, and a code that doesn't match the sale is fined. The official search at [tasnif.soliq.uz](https://tasnif.soliq.uz) only finds a code when you already type the catalog's own wording: «капучино» returns nothing, «услуги общественного питания» suggests Coca-Cola. This app searches the same catalog by meaning, in Russian, Uzbek (Latin and Cyrillic) and English.

It starts as a search. The same search later becomes the tool behind a conversational agent.

## Run

```bash
pnpm --filter tasnif dev      # http://localhost:3005
pnpm --filter tasnif build
```

## Data

The catalog lives in schema `tasnif` on the shared Supabase project (`supabase/migrations/20260917031500_tasnif_catalog.sql`). The schema is service-role only: no anon access, RLS on every table, nothing referencing Krafta's own schemas.

| Table | What's in it |
|---|---|
| `tasnif.nodes` | The tree above a product: group › class › position › sub-position, with Russian and Uzbek names |
| `tasnif.codes` | One row per IKPU: names, brand, attribute, barcode, units, benefit, `kind` (goods / service / catering), active or inactive |
| `tasnif.packages` | Numeric package codes, the second number a receipt needs |
| `tasnif.sync_runs` | Every import and backfill, for the "synced on" date |

Official sources:

| What | URL |
|---|---|
| Full catalog, Russian | `https://tasnif.soliq.uz/api/cls-api/excel/get/category?lang=ru` |
| Full catalog, Uzbek Latin / Cyrillic | same, `lang=uz_latn` / `lang=uz_cyrl` |
| Deactivated codes | `https://tasnif.soliq.uz/api/cls-api/excel/get/inactive-mxik?lang=ru` |
| One code, with package codes | `https://tasnif.soliq.uz/api/cls-api/mxik/get/by-mxik?mxikCode=…&lang=…` |

Package codes for the whole catalog are only offered on the site's catalog page behind a captcha. A person downloads that file by hand; scripts never go around the captcha.

## Scripts

Python, run with [uv](https://docs.astral.sh/uv/). Both default to a dry run that writes nothing.

```bash
# Import the Excel export (Russian names, units, barcodes, benefits)
pnpm --filter tasnif catalog:import --file ~/Downloads/category_0_ru.xlsx
pnpm --filter tasnif catalog:import --file ~/Downloads/category_0_ru.xlsx --apply

# Uzbek names, package codes, benefit names, one code at a time (3 requests/second)
pnpm --filter tasnif catalog:backfill --limit 5
pnpm --filter tasnif catalog:backfill --apply --scope core
```

Both talk to the database through the Supabase Management API with your Supabase CLI login (`supabase login`), so no database password or service key is needed on disk.

## Plan

See [PLAN.md](PLAN.md).
