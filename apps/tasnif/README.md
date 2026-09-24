# tasnif

`tasnif.krafta.uz` — a free, open search over Uzbekistan's national product and service catalog (IKPU / MXIK codes). Open to search engines since 2026-09-25.

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

## Daily catalog sync

The catalog updates itself once a day, from a Mac in Uzbekistan. tasnif.soliq.uz only accepts connections from Uzbekistan: it timed out from Vercel's functions, the Supabase database and Supabase's edge functions (AWS, US and Frankfurt) and from GitHub's runners (Azure), and answered instantly from Tashkent (tested 2026-09-24/25). Without a server in Uzbekistan, the machine that fetches the exports has to be one.

`scripts/mac/daily-sync.sh` runs `scripts/sync_catalog.py`, and launchd starts it at 09:30 every day, or when the Mac wakes if it was asleep then. A run downloads the three catalog exports and the switched-off list, imports only what changed (by content, not by file bytes), fetches package codes for new codes, rebuilds their search entries, and writes everyday words and embeddings for new categories. The steps and the reasons behind them are in `scripts/sync_catalog.py`. Each day is one `tasnif.sync_runs` row with `source = 'nightly'`: `notes` shows what happened, and `error` is set if the day didn't finish. The footer's "catalog updated" date is the last day that finished. The log is `~/Library/Logs/tasnif/sync.log`.

```bash
pnpm --filter tasnif catalog:sync --check   # what today would import; writes nothing
pnpm --filter tasnif catalog:sync           # run today's sync now, start to finish
```

Install the daily job (on the Mac, once):

```bash
sed -e "s|SCRIPT_PATH|$PWD/scripts/mac/daily-sync.sh|" -e "s|LOG_DIR|$HOME/Library/Logs/tasnif|" \
  scripts/mac/uz.krafta.tasnif-sync.plist > ~/Library/LaunchAgents/uz.krafta.tasnif-sync.plist
mkdir -p ~/Library/Logs/tasnif
launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/uz.krafta.tasnif-sync.plist
launchctl kickstart gui/$(id -u)/uz.krafta.tasnif-sync   # optional: run once now
```

It uses the Mac's Supabase CLI login and the OpenAI key in `.env.local`, so it has no secrets of its own. Remove it with `launchctl bootout gui/$(id -u)/uz.krafta.tasnif-sync` and delete the plist.

Two runs never work at once: each takes a lease first (one at a time across all days), and the catalog importer only clears staged rows of dead runs, since a row missing from staging would switch its code off.

### If a server in Uzbekistan ever exists

The same sync also runs on Vercel, and was built to: `api/nightly_sync.py` carries a day's run forward within a time budget per call. Its schedule is off (`vercel.json` has no `crons`) because every download fails from Vercel. To turn it on:

1. On a VPS with a public IP in Uzbekistan, run squid as in `docs/atmos-egress-proxy.md` (Path C) with the destination swapped. It only ever sees an encrypted tunnel to tasnif.soliq.uz:443:

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

2. Set these production variables on the tasnif Vercel project (the first two are already set):

   | Variable | What |
   |---|---|
   | `TASNIF_DATABASE_URL` | `postgresql://tasnif_sync.hlmcoirjaydrfqcmnuun:<password>@aws-1-us-east-1.pooler.supabase.com:5432/postgres?sslmode=require`. The role can reach schema `tasnif` and nothing else (`supabase/migrations/20260923233000_tasnif_sync_role.sql`). |
   | `CRON_SECRET` | Any long random string. Vercel sends it with every cron call; the function refuses calls without it. |
   | `TASNIF_EGRESS_PROXY_URL` | `http://<user>:<password>@<server-in-uzbekistan>:3128` |

3. Add the schedule back to `vercel.json`: `"crons": [{ "path": "/api/nightly_sync", "schedule": "*/15 21-23 * * *" }]` (02:00–04:45 Tashkent), and retire the Mac job.

`OPENAI_API_KEY` is shared with the site. The captcha-gated units export stays a manual download (`catalog:packages`); new codes get their package codes from the per-code endpoint instead.

## Search engines

Russian comes first: most people look for IKPU codes in Russian, so `/ru` is the `x-default`, and the sitemaps list Russian addresses only. Every page names its Uzbek and English versions itself (`hreflang`), which is how search engines find those.

| What | Where |
|---|---|
| `robots.txt` | Everything may be crawled except `/api/`. Points to the sitemap. |
| `/sitemap.xml` | An index: `/sitemaps/catalog.xml` (home, catalog, 14,501 category pages), then `/sitemaps/codes-0.xml` … with 25,000 codes each. Rendered on request, cached by Vercel's CDN for a day, so a deploy never reads the catalog. |
| `/ru/catalog`, `/ru/catalog/<code>` | The catalog tree as pages. A sub-position lists its codes 100 per page (`?page=2`). Every code is a few links from the home page. |
| Page metadata | `lib/site.ts` `pageMetadata()`: title, description, canonical, `hreflang`, Open Graph. Each page sets its own; the layout only sets defaults, because a layout-level canonical would be inherited by every page. |
| Structured data | Home: `WebSite` (the name "Tasnif" in results) and `FAQPage`. Categories and codes: `BreadcrumbList`. |
| Crawlers get whole pages | `htmlLimitedBots` in `next.config.ts` adds Googlebot to Next's list (Yandex, Bing, link previews), so they get the full page with its metadata in `<head>` in the first response. |

Unknown codes and categories answer with a friendly page and `noindex`, not a 404. Two indexes and `tasnif.sitemap_code_starts()` (`supabase/migrations/20260925100000_tasnif_catalog_pages.sql`) keep the deep catalog pages and the sitemaps fast.

To register the site: [Google Search Console](https://search.google.com/search-console) and [Yandex Webmaster](https://webmaster.yandex.com), add `https://tasnif.krafta.uz`, verify, and submit `https://tasnif.krafta.uz/sitemap.xml`. A verification meta tag goes in `app/[locale]/layout.tsx` (`verification` in the metadata).

## Plan

See [PLAN.md](PLAN.md).
