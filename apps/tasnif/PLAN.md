# tasnif.krafta.uz — plan v1

Draft for review · 2026-09-16 · No code yet

## 1. What we're building

A free, open-source website where anyone finds the right IKPU code by describing what they sell in their own words: Russian, Uzbek (Latin or Cyrillic) or English. Every official search mode is included, so nobody has to go back to tasnif.soliq.uz.

It starts as a search. The next phase turns the same search into a conversational agent.

**Why it's needed.** The official search only works when you already type the catalog's own wording. Live test, 2026-09-16:

| Someone types | Official search returns | The right code exists |
|---|---|---|
| капучино | 0 matches; suggests Torabika sachets, a Milka bar | `10202001010000002` coffee drinks made in a catering place |
| кофе с молоком навынос | 0; suggests Fanta Orange | same |
| плов | 0; suggests plov spice mixes | `10202001006000001` main dishes with meat, made in a catering place |
| osh | 49; #1 is software design services ("b**osh**qaruv") | same as плов |
| услуги общественного питания | 0; suggests Coca-Cola cans | group 102 |
| стрижка | washing powder | — |
| подписка на программное обеспечение | Coca-Cola | `10305008002000000` |
| курсы английского языка, аренда офиса, iPhone 15 | nothing | — |

Since 2023-03-01, a receipt or e-invoice whose IKPU doesn't match what was sold is fined under Tax Code Article 223. Krafta Pay itself asks merchants to paste the IKPU and package code by hand.

## 2. v1 scope (approved 2026-09-16)

1. **Search page.** One box in RU / UZ / EN. It understands meaning, typos and both Uzbek scripts, and recognises numbers (code, barcode, TN VED) automatically.
2. **Make it or resell it.** When a query matches both, food and drink results split into "you make and serve it" (catering codes) and "you resell a packaged product" (goods codes).
3. **A page for every code.** Code, package codes, units, category path, barcode and tax benefit, all with copy buttons, at a shareable URL.
4. **Free open API** (no key) and a downloadable copy of the catalog.
5. **Daily sync** with the official catalog.
6. **👍/👎 on results.**

Not in v1: bulk matching, the conversational agent, Telegram bot, ChatGPT/Claude plug-in, Krafta Pay code picker (see §9).

## 3. The data

### What the uploaded Excel contains (`classifier.xlsx`, 31 MB, one sheet)

| | Count |
|---|---|
| Codes (17 digits, all unique) | **440,818** (official site shows 440,898, so the file is slightly behind) |
| Groups / classes / positions / sub-positions | 115 / 1,282 / 2,855 / 10,232 (14,484 tree nodes) |
| Codes with a brand name | 245,284 |
| Codes without a brand | 195,534 (incl. 6,999 category-level codes) |
| Service codes (groups 100–117) | 922 = 874 services + 48 café/restaurant codes (class 10202) |
| Codes with a barcode | 193,102 |
| Codes with a tax-benefit ID | 37,466 (the export's `0` means none) |
| Codes with package *names* | 81,060 |
| Languages | **Russian only** |

Two export files were checked (`classifier.xlsx`, `catalog-excel.xlsx`): identical, row for row.

**Export quirks the importer handles and reports:** stray whitespace or newlines in ~186k cells; 2,453 brand cells with a brand code but no name; digits 12–14 of a code are a brand for some rows but a bare numbering slot for ~97k others (`06810006002034 ---`), so brand is taken from the name, never the digits; 4 tree nodes spelled two ways (the most common spelling wins).

Code anatomy: `102 02 001 010 000 002` = group · class · position · sub-position · brand · attribute.

Columns: Группа, Класс, Позиция, Субпозиция, Бренд, Атрибут, ИКПУ, Название ИКПУ, Штрих код, fixed unit (measure / unit / package), recommended unit (measure / unit), ID-льготы.

### What's missing, and where it comes from

| Need | In the Excel? | Source |
|---|---|---|
| Uzbek Latin + Cyrillic names | No | **The same public homepage export in the other languages:** `excel/get/category?lang=uz_latn` (`category_0_lat.xlsx`, 31 MB) and `lang=uz_cyrl` (`category_0_uz.xlsx`, 31 MB). No per-code requests needed |
| **Package codes** (numeric, required on receipts; e.g. `1747305` = "1 шт. (кружка/стакан)") | Package names only | Whole catalog: the catalog page's "Упаковки" export (`package_ru.xlsx`, 20 MB). The page asks for a captcha, so a person downloads it by hand. New or changed codes after that: the per-code endpoint `mxik/get/by-mxik` |
| Tax-benefit names | IDs only | One call: `integration-mxik/references/lgota` |
| TN VED, drug certificate, INN, KMMK lookups | No | Official modes, mapped from the site's code: text `mxik/search-subposition?search_text=`, advanced `mxik/search/by-params?text=`, IKPU `…by-params?mxikCode=`, barcode `…by-params?gtin=`; TN VED / INN / certificate / KMMK still to map |
| English names | Not in official data at all (`lang=en` returns Uzbek Cyrillic) | Meaning search handles English queries; one-time machine-translated glosses for category names, labelled as translation |
| Deactivated codes | No | Official list `excel/get/inactive-mxik?lang=ru` (14 MB), plus the nightly diff; inactive codes are marked, never deleted |

**Where the files come from.** Two official download points, same data:

- the homepage's "Excel форматида юклаш" link, which is `excel/get/category`, a plain public download (`classifier.xlsx`, 440,818 codes);
- [tasnif.soliq.uz/catalog](https://tasnif.soliq.uz/catalog) → "Выгрузить в: Информация об ИКПУ" (`catalog-excel.xlsx`), identical row for row, but its download dialog includes a captcha.

The nightly sync uses only the homepage link. Nothing automated goes around the catalog page's captcha.

**Per-code backfill** (`scripts/backfill_details.py`). Three official calls per code (ru, uz_latn, uz_cyrl), capped at 3 requests per second in total. Now only a fallback, for package codes of new or changed codes, since the language exports cover names:

- `core`: café, service and category-level codes, ~8k codes, about an hour
- `generic` / `all`: don't run; use the exports

## 4. How the search works

**One box, routed by input.** If the input is only digits, we try every reading that fits and group the results:

- **IKPU:** 17 digits is an exact code; 3, 5, 8, 11 or 14 digits is a category prefix.
- **Barcode:** 8, 12, 13 or 14 digits.
- **TN VED:** first digits, up to 10.

Anything else goes to text search. Brand, INN, drug certificate and KMMK stay reachable through a small "search by" menu, matching the official modes.

**Text search blends three signals, merged by rank (RRF, not added scores):**

1. **Words.** Postgres full-text and trigram typo matching over the Russian, Uzbek Latin and Uzbek Cyrillic names. Includes Cyrillic↔Latin transliteration and one form for all apostrophes (o' oʻ o‘ o’).
2. **Meaning.** Vector embeddings (pgvector).
3. **Everyday words.** A one-time AI pass writes how normal people name each category, in three languages. Café drinks, for example, get "капучино, латте, американо, раф, чай, лимонад · kapuchino, choy · cappuccino, latte, tea". The catalog speaks bureaucratese; this pass is what lets "капучино" find `10202001010000002`.

**What gets meaning search, and why not everything.** The catalog lives on `kraftabase`, a 1 GB-memory instance shared with Krafta's shops, Krafta Pay and Krafta AI. So we start small and grow only if the benchmark asks for it:

1. **Start:** meaning search over the 14,484 category nodes plus the 922 café and service codes (~15k vectors, well under 100 MB with its index). A query finds the right categories by meaning. Word search then ranks the codes inside them and across the whole catalog.
2. **Only if the benchmark shows gaps:** add the 195k codes without a brand, at a reduced vector size.
3. **Never:** the 245k branded rows. They're brand names and pack sizes ("Torabika Капучино 25г"), which word search and barcodes handle better. Leaving them out also stops a branded retail item from outranking the right generic code.

**Result shape:**

- One top answer plus 2–4 alternatives, each with its category path, so the user sees *why* it fits.
- Lanes when both kinds match:
  - "Готовите и подаёте сами" (catering, group 102) vs "Продаёте упакованный товар" (goods)
  - more generally, services vs goods
- Branded matches collapse under their category: "+128 branded products here".
- No dead ends. Zero results shows the nearest categories and a link to the official form for requesting a new code.

**Ranking rules carried over from Krafta's storefront search** (114/116 on its eval):

- merge by rank, never add scores
- no hard similarity cut-offs
- exact and prefix name boosts
- de-duplicate on the server

## 5. Proving it's better: benchmark first

- `eval/cases.jsonl`, about 150 cases:

  | Category | Cases |
  |---|---|
  | Cafés and restaurants | 40 |
  | Retail goods | 40 |
  | Services | 30 |
  | Typos and scripts | 20 |
  | Numbers (codes, barcodes, TN VED) | 20 |

  Each case holds the query, language, acceptable codes, where the answer came from, and who reviewed it.
- A runner scores both our search and the official one (live API) on top-1 and top-3, split by category and by language.
- **Ship bar:**
  - the right code in the top 3 for at least 90% of all cases, and at least 85% in each language
  - zero empty results on the set
- The answer key is drafted from the catalog. Every case stays marked **unverified** until an accountant reviews it.
- The scoreboard goes public at `/benchmark` and runs in CI on every change.

## 6. Website and API

Pages exist under `/ru`, `/uz` and `/en`:

| Page | What it's for |
|---|---|
| `/` | Search |
| `/code/{ikpu}` | Names in all languages (+ EN gloss), package codes, units, barcode, benefit, path, active/inactive, "synced on" date, link to the official site, feedback |
| `/browse/{prefix}` | Walk group → class → position → sub-position (the official site has this too) |
| `/benchmark` | Scoreboard vs the official search |
| `/api` | API docs |
| `/about` | Unofficial disclaimer, data source, license, how it works, how to contribute |

API: JSON, open CORS, no key.

- `GET /api/v1/search?q=&lang=&lane=&limit=`
- `GET /api/v1/codes/{ikpu}` (includes packages)
- `GET /api/v1/tree/{prefix}`
- `GET /api/v1/lookup?mode=barcode|tnved|mnn|dv|kmmk&value=`
- `GET /data/catalog-latest.csv.gz` (nightly)
- OpenAPI spec at `/api/openapi.json`

**One search function** serves the page, the API and, in phase 2, the agent's tool. The agent doesn't get a second search.

**Only limit:** a rate rule on `/api/*` that slows down a single IP flooding it. People never hit it.

**Design.** Krafta DESIGN.md: Geist, oklch neutrals, codes in Geist Mono with tabular numbers. It must look clearly unofficial: no state emblem, no government colours, and a disclaimer in the footer and on code pages.

## 7. Stack and hosting

| Piece | Choice | Why |
|---|---|---|
| Code | Krafta monorepo, branch `feat/tasnif`; app as `apps/tasnif`; open-sourced when it launches | Database and migrations live in Krafta, so one repo keeps them in step |
| App | Next.js 16 · React 19 · Tailwind 4 · TypeScript · shadcn on Base UI | Same stack as Krafta |
| Database | **Existing `kraftabase`**, own schema `tasnif`, service-role only, RLS on (decided 2026-09-17) | Already paid for; the schema touches nothing in `public`, `commerce`, `payments` or `agent` |
| Migrations | Files in Krafta's git (`supabase/migrations/`), applied with the Supabase MCP, version re-stamped to the file's timestamp | Keeps history identical to the repo; Krafta's dev branch database no longer exists (NXDOMAIN, 2026-09-17) |
| Embeddings | OpenAI `text-embedding-3-large`, vector size picked by the benchmark; swappable | Proven on Krafta's multilingual search |
| Hosting | Vercel, `tasnif.krafta.uz` | Existing account |
| Import, sync + backfill | `apps/tasnif/scripts/*.py` through the Supabase Management API, nightly job to follow | No DB password or PostgREST exposure needed |

## 8. Costs

| Item | Cost |
|---|---|
| Database | Covered by the existing Krafta project. If tasnif traffic ever slows Krafta, the next instance size up is the fix (roughly +$5/month; measure first) |
| Embeddings, one-time | ~$1–3 (≈15k texts at the start; ~$3 even with all 196k unbranded codes) |
| Everyday-words AI pass + English glosses, one-time | ~$5–15 |
| Each search | ~$0.000001 (one query embedding): a million searches ≈ $1.30 |
| Nightly sync | cents (re-embeds only what changed) |
| Vercel | ~$0 extra |
| Phase 2 agent | Per-conversation LLM cost; needs a hard daily spend cap before it goes public |

## 9. After v1

1. **Conversational agent.**
   - Uses the same search as its tools: `searchIkpu`, `getCode`, `browseTree`, `officialLookup`.
   - Asks what an accountant would ask: do you make it or resell it? Is it packaged? What size?
   - Answers with code cards and a one-line why.
   - Handles bulk in the chat: paste a menu and get a table plus an Excel file.
   - Built on AI SDK v6 with the model set by env, and per-visitor and global daily spend caps.
2. **Bulk matching page:** paste a list or upload Excel.
3. **Telegram inline bot:** `@bot капучино` in any chat.
4. **MCP server** so ChatGPT and Claude can look codes up.
5. **Krafta Pay plan-form code picker,** calling the public API.

## 10. Risks

| Risk | What goes wrong | Mitigation |
|---|---|---|
| We suggest a wrong code | Merchant gets fined | Evidence on every result, alternatives shown, disclaimer, accountant-reviewed benchmark, 👎 feedback reviewed weekly |
| Official API changes or blocks us | New codes lack Uzbek names and package codes | Everything cached locally; polite rate + identifying user agent; Excel-only fallback still serves Russian search |
| Stale catalog | A deactivated code gets suggested | Nightly sync, "synced on" date, inactive banner |
| Site looks official | Trust and legal problem | No state symbols, clear disclaimer |
| Weak Uzbek meaning search | Uzbek speakers get worse answers | Per-language ship bar; official Uzbek names, transliteration, everyday words |
| Data license unclear | Takedown request | Catalog is published openly for download; we attribute and link back. No explicit license found yet, worth checking |

## 11. Build order

| Step | Work | What you can see after |
|---|---|---|
| 0 | ~~Supabase project~~ (existing `kraftabase`); domain and OpenAI key still open | — |
| 1 | **In progress 2026-09-17:** schema live on `kraftabase`; app registered in the monorepo as `apps/tasnif`; full Russian import running. Next: import the Uzbek Latin + Cyrillic exports and the deactivated list, load the package export once downloaded by hand, map TN VED / INN / certificate / KMMK | Whole catalog queryable in 3 languages |
| 2 | Draft the 150-case answer key; score the official search | "Official search: X%" |
| 3 | Search engine; iterate until the ship bar | "Ours: Y%", per language |
| 4 | Pages, i18n, design, mobile + desktop QA in a real browser | Preview URL |
| 5 | API, data download, feedback, nightly sync | API docs; first nightly run |
| 6 | Launch on tasnif.krafta.uz, README, scoreboard post | Live site |

## 12. Decisions needed

1. ~~New Supabase project~~ → existing `kraftabase` (decided 2026-09-17).
2. ~~Dev database~~ → none, anywhere; migrations go to prod as committed files (decided 2026-09-17).
3. ~~Push `feat/tasnif`~~ → OK; tasnif lives in the Krafta monorepo as `apps/tasnif` (2026-09-17).
4. ~~Where the catalog download lives~~ → [tasnif.soliq.uz/catalog](https://tasnif.soliq.uz/catalog); the homepage link serves the same file without a captcha (2026-09-17).
5. **OK to download the official exports:** Uzbek Latin and Cyrillic catalogs (~31 MB each) and the deactivated list (~14 MB) now, then nightly.
6. **The package-code export** ("Упаковки", ~20 MB) has a captcha, so it needs a person: download it once from the catalog page.
7. **Point `tasnif.krafta.uz` at Vercel** (at launch).
8. **A separate OpenAI API key** for this project, so its spend shows up separately. You add it to the env; I won't handle keys.
9. *Optional:* an accountant to review the answer key.
