/**
 * card-default.tsx — pure-RSC customer item card (KRA-35 PR1 / ER2).
 *
 * Exports:
 *   - CustomerItemCard: the read-only customer rendering. RSC. Used by
 *     the customer catalog at `/[catalog-slug]` via layout-registry.tsx
 *     (`card-default` → CustomerItemCard). Byte-identical to the previous
 *     `CatalogItemCard` export this file shipped before 2026-05-20.
 *   - CardMarkup: internal presentational sub-component shared with
 *     EditableItemCard (see `card-default-editable.tsx`). Pure markup,
 *     no event handlers, no client features. Exporting it keeps the
 *     two card surfaces in visual lockstep without duplicating JSX.
 *
 * ER2 RSC/client split — implementation note.
 * The eng-review D3 decision chose "one file, two exports" for
 * CustomerItemCard + EditableItemCard. That is not implementable in
 * Next.js: `"use client"` is a file-level directive, so a single file
 * is either fully RSC or fully client. The intent of D3 — visual
 * lockstep via co-location — is preserved by exporting CardMarkup
 * from this RSC file and importing it from a sibling client file
 * (`card-default-editable.tsx`, lands later in PR 1). Two files,
 * one source of truth for the markup, no client code reachable from
 * the customer bundle. Design doc ER2 updated to reflect this reality.
 *
 * Byte-identical guarantee: CardMarkup renders the exact same JSX the
 * pre-2026-05-20 card-default shipped — flex container, 64px photo, two-
 * column body, semibold price on the right. No DESIGN.md-driven visual
 * updates (e.g. font-mono tabular-nums on the price) ship in this PR;
 * those would change customer-facing rendering and violate the byte-
 * identical promise. Such updates are a separate visual-polish change.
 */

import Image from "next/image";
import type { ItemCardProps } from "@/lib/catalogs/layout-registry";
import { formatPriceCents } from "@/lib/catalogs/pricing";

/**
 * CardMarkup — internal presentational sub-component.
 *
 * Pure JSX. No event handlers, no client features. Renders the inside
 * of an item card (photo, name, description, price). Wrap it in a styled
 * container (border, padding, radius) at the caller — both CustomerItemCard
 * and EditableItemCard apply the same outer chrome.
 *
 * Exported so `card-default-editable.tsx` (client) can reuse the exact
 * markup the customer view ships. Single source of truth — change the
 * visual here and both customer and editor pick it up.
 */
export function CardMarkup({
  item,
  imageUrl,
  currencySettings,
}: ItemCardProps) {
  return (
    <>
      {/* Optional image */}
      {imageUrl && (
        <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-xs bg-muted">
          <Image
            src={imageUrl}
            alt={item.image_alt ?? item.name}
            fill
            sizes="64px"
            className="object-cover"
          />
        </div>
      )}

      {/* Text + price */}
      <div className="flex flex-1 items-start gap-3">
        <div className="flex min-w-0 flex-1 flex-col">
          <span className="line-clamp-2 text-sm font-medium">
            {item.name}
          </span>

          {item.description && (
            <span className="mt-1 line-clamp-3 text-xs text-muted-foreground">
              {item.description}
            </span>
          )}
        </div>

        <div className="ml-1 flex shrink-0 flex-col items-end">
          {/* NOTE: byte-identical to the pre-2026-05-20 rendering — see ER2.
              DESIGN.md says "font-mono tabular-nums for all UZS prices in
              stacked contexts," which the customer catalog technically is.
              Migrating this is a separate visual update tracked outside
              KRA-35 PR1 so the byte-identical promise stays intact. The
              Library Canvas (PR2) and InlineCurrency primitive will use
              font-mono tabular-nums from the start. */}
          <span className="text-sm font-semibold leading-none whitespace-nowrap">
            {formatPriceCents(item.price_cents, currencySettings)}
          </span>
        </div>
      </div>
    </>
  );
}

/**
 * CustomerItemCard — pure RSC. The read-only customer-facing item card.
 *
 * MUST stay RSC: no event handlers, no client-side imports, no hooks.
 * The customer bundle depends on this purity — EditableItemCard lives
 * in a sibling client file so this code path stays fully server.
 */
export function CustomerItemCard(props: ItemCardProps) {
  return (
    <div className="flex gap-3 rounded-xs border px-3 py-3">
      <CardMarkup {...props} />
    </div>
  );
}
