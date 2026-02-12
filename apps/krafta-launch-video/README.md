# Krafta Launch Video (Remotion)

Ultra-minimal, cinematic launch presentation for **Krafta**.

- Duration: ~30s
- Format: 1920×1080 @ 30fps

## Compositions

- `KraftaDemo` (default) — techy, dynamic SaaS-style demo montage
- `KraftaLaunch` — minimalist statement cut

## Develop

```bash
pnpm install
pnpm -C apps/krafta-launch-video dev
```

## Render

```bash
pnpm install
pnpm -C apps/krafta-launch-video render
```

Outputs `apps/krafta-launch-video/out/krafta-demo.mp4`.

Statement cut:

```bash
pnpm -C apps/krafta-launch-video render:statement
```
