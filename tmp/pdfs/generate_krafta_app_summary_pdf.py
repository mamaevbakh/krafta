from __future__ import annotations

from pathlib import Path
from reportlab.lib.pagesizes import letter
from reportlab.pdfbase.pdfmetrics import stringWidth
from reportlab.pdfgen import canvas
from pypdf import PdfReader

OUTPUT_PATH = Path('/Users/bakh/VSCode/krafta/output/pdf/krafta-app-summary.pdf')

PAGE_WIDTH, PAGE_HEIGHT = letter
LEFT = 42
RIGHT = 42
TOP = 42
BOTTOM = 36
MAX_WIDTH = PAGE_WIDTH - LEFT - RIGHT

TITLE = 'Krafta App - One-Page Summary'
SUBTITLE = 'Based only on repository evidence in /Users/bakh/VSCode/krafta.'

SECTIONS = [
    (
        'What it is',
        [
            'Krafta is a pnpm monorepo with two Next.js apps: a storefront/catalog app (`apps/krafta`) and a checkout/payment app (`apps/krafta-pay`).',
            'The root README describes it as commerce and payment infrastructure for small businesses in emerging markets.',
        ],
    ),
    (
        'Who it is for',
        [
            'Primary persona: SMB merchants (creators, freelancers, restaurants, retail shops, service providers) that need a no-code catalog and localized online payments.',
        ],
    ),
    (
        'What it does',
        [
            'Serves dynamic catalog routes (`/[...slug]`) and renders category/item pages from Supabase catalog data.',
            'Provides preview routes (`/preview/[...slug]`) with query-param layout and currency overrides for merchandising previews.',
            'Includes merchant dashboard routes protected by Supabase auth session checks in `apps/krafta/proxy.ts`.',
            'Exposes search API (`/api/search`) that calls Supabase Edge Function `embed_query`, then RPC `catalog_search_auto`, then `log_search`.',
            'Creates checkout sessions and provider attempts via `@krafta/payments-core` (`payme`, `click`, `uzum`).',
            'Processes provider webhooks and pushes checkout status updates over Supabase Realtime channels.',
        ],
    ),
    (
        'How it works (architecture)',
        [
            'Apps/UI: Next.js App Router apps (`krafta`, `krafta-pay`) plus shared workspace packages (`@krafta/theme`, `@krafta/supabase`, `@krafta/payments-core`).',
            'Catalog data flow: `apps/krafta/lib/catalogs/data.ts` fetches Supabase REST tables (catalogs, categories, items, translations, media) with cache tags.',
            'Search flow: Client -> `/api/search` -> Edge Function `embed_query` -> RPC `catalog_search_auto` -> RPC `log_search` -> JSON results.',
            'Payments flow: API creates payment intent + checkout session -> pay page loads by public token -> provider attempt created -> redirect/iframe checkout.',
            'Status flow: provider webhook (`/api/webhooks/[provider]`) updates payment rows -> realtime broadcast (`checkout:{token}`) -> status watcher refreshes UI.',
        ],
    ),
    (
        'How to run (minimal)',
        [
            'Install prerequisites: Node.js `24.5.0` (from `.nvmrc`) and `pnpm`.',
            'Install workspace dependencies: `pnpm install`.',
            'Configure environment variables: Not found in repo as `.env.example` templates; existing `.env.local` files show Supabase and payment env vars are required.',
            'Start development: `pnpm dev` (or `pnpm dev:krafta` / `pnpm dev:krafta-pay`).',
            'Open app URLs: `http://localhost:3000` (krafta) and `http://localhost:3001` (krafta-pay).',
            'Production deploy URL / release process: Not found in repo.',
        ],
    ),
]

SOURCE_LINE = (
    'Evidence: apps/krafta/README.md, package.json, .nvmrc, apps/krafta/app/api/search/route.ts, '
    'apps/krafta/lib/catalogs/data.ts, apps/krafta/proxy.ts, apps/krafta-pay/app/api/*, packages/payments-core/src/*.'
)


def wrap_text(text: str, font: str, size: float, width: float) -> list[str]:
    words = text.split()
    if not words:
        return ['']
    lines: list[str] = []
    current = words[0]
    for w in words[1:]:
        candidate = f'{current} {w}'
        if stringWidth(candidate, font, size) <= width:
            current = candidate
        else:
            lines.append(current)
            current = w
    lines.append(current)
    return lines


def draw_section(c: canvas.Canvas, y: float, heading: str, bullets: list[str], body_size: float) -> float:
    heading_size = body_size + 1.8
    body_leading = body_size + 2.4

    c.setFont('Helvetica-Bold', heading_size)
    c.drawString(LEFT, y, heading)
    y -= heading_size + 4

    for item in bullets:
        wrapped = wrap_text(item, 'Helvetica', body_size, MAX_WIDTH - 14)
        c.setFont('Helvetica', body_size)
        for i, line in enumerate(wrapped):
            prefix = '- ' if i == 0 else '  '
            c.drawString(LEFT + 2, y, prefix + line)
            y -= body_leading
        y -= 2

    return y - 2


def build_pdf(body_size: float) -> tuple[Path, float]:
    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    c = canvas.Canvas(str(OUTPUT_PATH), pagesize=letter)

    y = PAGE_HEIGHT - TOP
    c.setTitle('Krafta App Summary')
    c.setAuthor('Codex')

    c.setFont('Helvetica-Bold', body_size + 6)
    c.drawString(LEFT, y, TITLE)
    y -= body_size + 10

    c.setFont('Helvetica', body_size - 0.2)
    for line in wrap_text(SUBTITLE, 'Helvetica', body_size - 0.2, MAX_WIDTH):
        c.drawString(LEFT, y, line)
        y -= body_size + 2

    y -= 3

    for heading, bullets in SECTIONS:
        y = draw_section(c, y, heading, bullets, body_size)

    c.setFont('Helvetica-Oblique', body_size - 1.0)
    for line in wrap_text(SOURCE_LINE, 'Helvetica-Oblique', body_size - 1.0, MAX_WIDTH):
        c.drawString(LEFT, y, line)
        y -= body_size + 1.6

    c.save()

    return OUTPUT_PATH, y


def main() -> None:
    chosen_size = None
    final_y = None

    for size in [8.8, 8.5, 8.2, 8.0, 7.8]:
        path, y = build_pdf(size)
        reader = PdfReader(str(path))
        pages = len(reader.pages)
        if pages == 1 and y > BOTTOM:
            chosen_size = size
            final_y = y
            break

    if chosen_size is None:
        raise RuntimeError('Could not fit content to one page without overflow.')

    print(f'Generated: {OUTPUT_PATH}')
    print(f'Body font size: {chosen_size}')
    print(f'Final cursor y: {final_y:.2f} (bottom margin: {BOTTOM})')


if __name__ == '__main__':
    main()
