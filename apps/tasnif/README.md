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

From a laptop they talk to the database through the Supabase Management API with your Supabase CLI login (`supabase login`), so no database password or service key is needed on disk. With `TASNIF_DATABASE_URL` set they connect directly instead, as the restricted `tasnif_sync` role. Re-running any of them on an unchanged file writes nothing.

## Nightly sync

The catalog updates itself every night. A Vercel cron (`vercel.json`) calls `api/nightly_sync.py` every 15 minutes between 02:00 and 05:00 Tashkent time. Each call carries the night's run forward: it downloads the three catalog exports and the switched-off list, imports only what changed (by content, not by file bytes), fetches package codes for new codes, rebuilds their search entries, and writes everyday words and embeddings for new categories. The steps and the reasons behind them are in `scripts/sync_catalog.py`. Each night is one `tasnif.sync_runs` row with `source = 'nightly'`: `notes` shows what happened, and `error` is set if the night didn't finish. The footer's "catalog updated" date is the last night that finished.

```bash
pnpm --filter tasnif catalog:sync --check   # what tonight would import; writes nothing
pnpm --filter tasnif catalog:sync           # run tonight's sync from a laptop, start to finish
```

It needs two production environment variables on the Vercel project, besides the site's own:

| Variable | What |
|---|---|
| `TASNIF_DATABASE_URL` | `postgresql://tasnif_sync.hlmcoirjaydrfqcmnuun:<password>@aws-1-us-east-1.pooler.supabase.com:5432/postgres?sslmode=require`. The role can reach schema `tasnif` and nothing else (`supabase/migrations/20260923233000_tasnif_sync_role.sql`). It has no login until someone sets a password in the Supabase SQL editor: `alter role tasnif_sync with login password '<long random password>';` |
| `CRON_SECRET` | Any long random string. Vercel sends it with every cron call, and the function refuses calls without it. |

| `TASNIF_EGRESS_PROXY_URL` | `http://<user>:<password>@<server-in-uzbekistan>:3128`. The tax committee's firewall drops connections from the big clouds: tasnif.soliq.uz times out from Vercel's functions and the Supabase database (AWS) and from GitHub's runners (Azure), while Tashkent connects instantly. So the sync reaches the site through a small proxy inside Uzbekistan. Unset, requests go out directly, which is right for a laptop in Uzbekistan and fails on Vercel. |

`OPENAI_API_KEY` is shared with the site. The captcha-gated units export stays a manual download (`catalog:packages`); new codes get their package codes from the per-code endpoint instead.

The proxy only needs to tunnel HTTPS to one host. On a VPS with a public IP in Uzbekistan, squid set up as in `docs/atmos-egress-proxy.md` (Path C) with the destination swapped does it:

```squid
http_port 3128
auth_param basic program /usr/lib/squid/basic_ncsa_auth /etc/squid/passwd
auth_param basic realm tasnif-egress
acl authenticated proxy_auth REQUIRED
acl tasnif_host dstdomain tasnif.soliq.uz
acl ssl_port port 443
acl connect_only method CONNECT
http_access allow authenticated connect_only tasnif_host ssl_port
http_access deny all
```

It only ever sees an encrypted tunnel to tasnif.soliq.uz:443, never the content. If Krafta Pay's Atmos proxy runs in Uzbekistan, adding `tasnif.soliq.uz` to its allowed destinations is enough.

Two calls never work on the same night at once: each takes a lease on the night's row first, and the catalog importer only clears staged rows of dead runs, since a row missing from staging would switch its code off.

## Plan

See [PLAN.md](PLAN.md).
