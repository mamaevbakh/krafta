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
| `tasnif.packages` | Numeric package codes, the second number a receipt needs; `origin` says whether the tax committee fixed it or a business created it |
| `tasnif.inactive_codes` | The committee's list of switched-off codes, kept so an old code can be answered with "switched off, try these" |
| `tasnif.sync_runs` | Every import, for the "synced on" date |

Official sources:

| What | Where | Script |
|---|---|---|
| Full catalog, Russian (codes, names, units, barcodes, benefits) | `https://tasnif.soliq.uz/api/cls-api/excel/get/category?lang=ru` | `catalog:import` |
| Full catalog names, Uzbek Latin and Cyrillic | same URL with `lang=uz_latn` and `lang=uz_cyrl` | `catalog:names` |
| Package codes for every code (fixed units + packages businesses created) | [tasnif.soliq.uz/catalog](https://tasnif.soliq.uz/catalog) → «Выгрузить в» → units → «Скачать» | `catalog:packages` |
| Switched-off codes | `https://tasnif.soliq.uz/api/cls-api/excel/get/inactive-mxik?lang=ru` | `catalog:inactive` |
| One code, live | `https://tasnif.soliq.uz/api/cls-api/mxik/get/by-mxik?mxikCode=…&lang=…` | `catalog:backfill` (fallback) |

The three homepage URLs are plain public downloads. The units export sits behind a captcha on the catalog page, so a person downloads it; scripts never go around the captcha.

## Scripts

Python, run with [uv](https://docs.astral.sh/uv/). Every script is a dry run unless given `--apply`, and each records itself in `tasnif.sync_runs`. Run them in this order: the Russian catalog defines which codes exist, the rest attach to it.

```bash
pnpm --filter tasnif catalog:import   --file ~/Downloads/category_0_ru.xlsx --apply
pnpm --filter tasnif catalog:names    --latn ~/Downloads/category_0_lat.xlsx --cyrl ~/Downloads/category_0_uz.xlsx --apply
pnpm --filter tasnif catalog:packages --file ~/Downloads/package_ru.xlsx --apply
pnpm --filter tasnif catalog:inactive --file ~/Downloads/inactiveMxik_ru.xlsx --apply
```

They talk to the database through the Supabase Management API with your Supabase CLI login (`supabase login`), so no database password or service key is needed on disk. Re-running any of them on an unchanged file writes nothing.

## Plan

See [PLAN.md](PLAN.md).
