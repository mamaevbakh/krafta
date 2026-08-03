# The landing page

Rendered at `/` by `app/page.tsx`. A scroll-scrubbed WebGL hero over twelve
content sections, all driven by `editions.ts`.

```
LandingPage.tsx     the whole page — the only thing app/page.tsx imports
editions.ts         every string on the page: sections, features, nav labels
SiteHeader.tsx      fixed header; inverts its colours over cream sections
SectionRail.tsx     the left-gutter index (xl and up)
Hero.tsx            display headline + the section index
EditionSection.tsx  one content section: headline block, then feature panel
FeatureMedia.tsx    deterministic abstract artwork standing in for product video
Reveal.tsx          IntersectionObserver fade-up
ScrollSpy.tsx       which surface is under the header right now
landing.css         palette + type scale (see "Styles" below)
hero/               three.js scene — see hero/HeroCanvas.tsx for the asset map
```

## Copy is Shopify's — replace it before launch

`editions.ts`, the header brand line and the footer copyright are still the
marketing text from Shopify Editions Winter '26, which is what the bundle
shipped with. The layout and palette were measured off that page too. None of it
is Krafta's to publish: swap `editions.ts`, `EDITION.name` in `SiteHeader.tsx`
and the footer line in `SiteFooter.tsx` for Krafta Pay copy before this page goes
in front of anyone.

## Styles

`landing.css` is imported from `app/globals.css`, immediately after
`@import "tailwindcss"` — **not** from a component. Tailwind 4 resolves `@theme`
at build time, so a JS import leaves `text-cream`, `bg-canvas` and the rest
undefined and the page renders unstyled.

Typography follows DESIGN.md rather than the bundle. The system allows three
faces — Geist Sans, Geist Mono, and Helvetica Neue Bold for the wordmark — and
rules out a display serif, so both the grotesk and the serif role resolve to
Geist. `--font-serif` keeps its name because the markup asks for it by that name.

## Verifying it

The in-app browser preview cannot check this page. A non-displayed pane parks the
tab in `visibilityState: "hidden"`, which suspends `requestAnimationFrame`
outright — the scene never starts, so a working hero looks broken. Use headless
Chromium, which composites offscreen regardless:

```bash
node scripts/shoot.mjs --url http://localhost:3003          # six hero beats
node scripts/shoot.mjs --url http://localhost:3003 --sections
node scripts/shoot.mjs --url http://localhost:3003 --mobile
pnpm hero:preview                                            # build + serve + shoot
```

Frames land in `captures/` (gitignored). `scripts/frame-probe.mjs` prints each
figure's viewport extents and where the contact spark lands — use it instead of
guessing whether something sits off screen.

WebGL runs on SwiftShader in headless Chromium; `shoot.mjs` forces it rather than
letting Chromium autodetect, because the default headless GPU path yields a
context that fails the renderer's capability checks and reads as a broken scene.

## Gotchas worth keeping

- **StrictMode double-mounts would kill the WebGL context.** The scene is owned
  by the canvas element (`canvas.__heroScene`) and published *before* the
  `await`; cleanup calls `stop()` and never `dispose()`. Building a second
  `WebGLRenderer` on the same canvas yields a dead one that never loads.
- **Content sections are still at opacity 0 after 900 ms** and settle around 2 s.
  Screenshot earlier and you photograph the reveal mid-flight.
- **Fallback is deliberate.** If WebGL is unavailable or an image 404s, the catch
  fires, the painted backdrop stays, and the copy on top stays readable. Keep it.
- `prefers-reduced-motion` freezes the idle drift; the scroll scrub still works.
