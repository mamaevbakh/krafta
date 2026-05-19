# ADR 0003 — Image pattern (Next.js + Supabase)

**Status:** Accepted. 2026-05-20. Implements [KRA-9](https://linear.app/krafta/issue/KRA-9).

## Context

Catalog pages were emitting Next.js `<Image fill>` warnings ("missing `sizes` prop"). Hypothesis from the trigger ticket: Supabase-stored images weren't routed through optimization, and not every image used `next/image`.

Audit: 17 `<Image>` use-sites across customer-facing (catalog cards, headers, item details, search results) + 6 in the merchant dashboard. Every `fill`-mode image was missing `sizes`. No raw `<img>` in production code (the `components/ai-elements/` directory has 5 `<img>` tags but is dead code, never imported).

## Decision

For v1, **stay on the default Next.js `<Image>` loader** (`/_next/image?url=...&w=...`) and add the missing `sizes` prop on every `fill`-mode image. Defer the move to Supabase Storage's transform endpoint until cost or LCP data justifies it.

### Canonical pattern

- **`fill` mode** (object-cover into a sized container): always pass `sizes`. Match the container.
  - Single small element (logo / thumbnail): `sizes="48px"` (or the actual pixel size).
  - Banner / hero: `sizes="(max-width: 768px) 100vw, 768px"`.
  - Grid card: `sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"`.
- **Explicit dimensions** (`width` + `height`): preferred when the rendered size is fixed and not constrained by a parent.
- **`priority`**: above-the-fold images only. Header logos, hero banners. Never on below-fold cards.
- **Static images** (e.g. `public/`): plain `<Image>` is fine; the default loader handles them.
- **Supabase-stored images**: pass through the default loader for v1. URLs come from `getCatalogLogoUrl`, `getItemImageUrl` (lib/catalogs/media.ts) which point at `/storage/v1/object/public/...`. Both `kraftabase` and the dev branch are in `next.config.ts → images.remotePatterns`.

### Resolved open questions

| Question | Decision | Why |
|---|---|---|
| Self-host OG-image cache vs Supabase CDN | Use Supabase CDN | No infra burden; revisit if `next/image` proxy CPU shows up in Vercel costs. |
| Standard `sizes` breakpoints | 640 / 1024 px | Matches Tailwind's `sm` / `lg`; consistent across cards. |
| Blur placeholders | Skip for v1 | Requires upload-time blurhash generation. Defer to a follow-up. |

## Consequences

- Every `<Image fill>` must include `sizes`. ESLint doesn't catch this today; PR review or `/review` checks it.
- If we hit Vercel image-optimization quota or want regional CDN locality, the upgrade path is: introduce a custom loader in `lib/image-loader.ts` that rewrites `/storage/v1/object/public/...` → `/storage/v1/render/image/public/...?width=...&quality=...&format=webp`, and add the render URL pattern to `next.config.ts → images.remotePatterns`. No call-site changes needed if applied globally via `images.loader: 'custom'` + `loaderFile`.
- Dead `<img>` tags in `components/ai-elements/` aren't in production. Left in place; remove when the AI scaffolding gets pulled into a feature or deleted.

## Out of scope

- The merchant dashboard's `org-switcher` + `catalog-switcher` use explicit `width` + `height` (correct). No changes needed there.
- The `<ImageIcon>` from `lucide-react` in `prompt-input.tsx` is a Lucide icon, not an `<img>` tag.
