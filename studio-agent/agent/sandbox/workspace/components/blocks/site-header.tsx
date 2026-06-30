// Shop hero header — mirrors the Krafta storefront look: a small brand badge +
// the shop title, a short description, a row of tag chips, and the cart +
// theme/language controls on the right. Pure presentation; the agent rewrites
// it freely.
import type { ReactNode } from "react";

import { CartButton } from "@/components/commerce/cart-button";

export function SiteHeader({
  shopName,
  description,
  tags = [],
}: {
  shopName: string;
  description?: string | null;
  tags?: string[];
}) {
  return (
    <header className="mx-auto max-w-5xl px-4 pt-8 pb-6">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <span className="rounded-md border border-border px-2 py-1 text-[11px] font-medium tracking-tight text-muted-foreground">
            Krafta
          </span>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
            {shopName}
          </h1>
        </div>
        <div className="flex items-center gap-2">
          <CartButton />
          <ToggleButton label="Toggle theme">
            <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <circle cx="12" cy="12" r="4" />
              <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
            </svg>
          </ToggleButton>
          <ToggleButton label="Change language">
            <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <circle cx="12" cy="12" r="10" />
              <path d="M2 12h20M12 2a15 15 0 0 1 0 20M12 2a15 15 0 0 0 0 20" />
            </svg>
          </ToggleButton>
        </div>
      </div>

      {description ? (
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted-foreground">
          {description}
        </p>
      ) : null}

      {tags.length > 0 ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {tags.map((tag) => (
            <span
              key={tag}
              className="rounded-full border border-border px-2.5 py-0.5 text-xs text-muted-foreground"
            >
              {tag}
            </span>
          ))}
        </div>
      ) : null}
    </header>
  );
}

function ToggleButton({
  children,
  label,
}: {
  children: ReactNode;
  label: string;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      className="flex size-9 items-center justify-center rounded-full border border-border text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
    >
      {children}
    </button>
  );
}
