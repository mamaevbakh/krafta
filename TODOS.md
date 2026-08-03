# TODOS

Deferred work with enough context to pick up cold. Each entry: what, why, context, dependencies.

## Anon-shop cleanup job (from ADR 0005 §6 lifecycle policy)

- **What:** Scheduled purge (pg_cron + SQL function) of anon-owned, never-published draft shops idle past the 90-day TTL.
- **Why:** Post-seeding, every abandoned "Create your shop" tap leaves ~25–40 rows (org, membership, catalog, venue, locales, categories, items, variations, translations, search documents). Unbounded growth without a GC.
- **Context:** ADR 0005 eng review (2026-06-10, D6) deliberately set the *policy* in the ADR and deferred the *automation* until real abandonment data exists — deleting merchant-built data is a one-way door, calibrate before automating. Guard conditions: org has **no non-anonymous member** AND venue **never activated** AND no writes for 90 days. The `is_anonymous` JWT-claim pattern used by the publish trigger guards (ADR 0005 §1) is the discriminator; at rest, check `auth.users.is_anonymous` for all members. Beware Supabase's generic "delete anon users after 30 days" advice — applied naively it cascade-deletes shops merchants are still building.
- **Pros:** bounded tables; policy already decided, job is mechanical. **Cons:** destructive automation; needs pgTAP coverage (harness exists per ADR 0005 test plan).
- **Depends on / blocked by:** launch + a few weeks of observed abandonment data.

## Item photo gallery follow-ups (from feat/item-photo-gallery ship review)

- **What:** Four deferred items from the multi-photo gallery ship: (1) expose the gallery through the commerce v1 API (`mapItem` still emits only `imageUrl`; mirror an additive `images: {url, alt}[]` into `packages/commerce` types so coded shops can render carousels); (2) collapse the media route's demote→promote→renumber→mirror sequences into one Postgres RPC so a mid-flight failure can't leave half-applied state (today each step fails loudly but non-transactionally), extracting the thrice-duplicated helper in the same pass; (3) explicit pagination/limit on the storefront `item_media` fetch (rides PostgREST's 1000-row default — a 200-item catalog at 6 photos each silently truncates); (4) per-photo alt text localization decision before the uploader's promised alt-editor ships (`item_media.alt` currently shadows the localized item-level alt in the detail view).
- **Why:** Each was flagged by the ship review army / red team and consciously deferred to keep the gallery diff focused; all four become real at scale or when adjacent features (Studio templates, alt editor) land.
- **Context:** PR "feat: item multi-photo gallery" (2026-07-15). The route's fail-loud error handling + `main-photo-contract.test.ts` document the invariant the RPC must preserve: main photo IS the first photo, `items.image_path` mirrors it.
- **Pros:** all four are mechanical once picked up; the contract tests already lock the semantics. **Cons:** the RPC migration touches prod DDL; commerce API change needs a Studio template to actually consume it.
- **Depends on / blocked by:** nothing hard; (1) pairs naturally with the coded-shop image-bucket fix task.

## Cart-regression Playwright smoke (KRA-35 debt)

- **What:** Playwright smoke covering the KRA-62 modifier-picker flow + KRA-63 variation pricing on items authored in the Library Canvas.
- **Why:** The KRA-35 design doc (2026-05-20) explicitly wanted this in CI before merge and fell back to manual QA because no e2e infrastructure existed. ADR 0005 (D12) stands up Playwright for onboarding — the marginal cost of paying this debt collapses once that harness lands.
- **Context:** Flows to cover are named in the KRA-35 design doc success criteria ("Cart regression E2E"): modifier picker + variation pricing on Library-authored items, customer side. The Library and cart keep co-evolving; this is the regression class manual sweeps miss between runs.
- **Pros:** closes a documented gap from the last epic; protects the customer cart against Library refactors. **Cons:** one more spec in the slowest CI tier.
- **Depends on / blocked by:** Playwright harness from ADR 0005 Phase 1 (wow-path spec) landing first.
