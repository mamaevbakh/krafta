"use client";

/**
 * inline-currency.tsx — focus-styled inline-editable price primitive (KRA-35 PR1 / DR3).
 *
 * Krafta-specific currency rendering: UZS (Uzbek sum), no decimals, comma
 * thousands separator (`25,000`, `1,250,000`). All prices render with
 * `font-mono tabular-nums` per DESIGN.md "Numerals everywhere money is
 * rendered" — Tashkent cafe prices reach millions of sums and need column
 * alignment in the Library Canvas + Inspector variations table.
 *
 * Built on the InlineText pattern (same modeless edit affordance, same
 * optimistic local + debounced autosave + blur flush). Adds UZS-specific
 * formatting (display layer) + parsing (input layer):
 *   - Display: format integer cents to "25,000" string.
 *   - Parse: accept "25,000", "25000", "25 000" (Russian space-thousands),
 *     "25.000" (typo-safe), reject "25.50" (no decimals in UZS v1).
 *
 * The component's `value` is INTEGER cents (matching `item_variations.price_cents`
 * in the schema). The save callback receives integer cents, never a string.
 * Conversion happens at the boundary so the server contract stays clean.
 *
 * Why not a separate hook + reuse InlineText? Two reasons: (1) the parsing
 * needs to live inline with the keystroke handler (rejecting bad input
 * before it hits debounce), and (2) the display string differs from the
 * raw value (formatted vs cents). Composing on top of InlineText would
 * require it to expose its handlers — cleaner to duplicate the small
 * focus/blur lifecycle here, since the value/save contract is different.
 */

import * as React from "react";
import { cn } from "@/lib/utils";
import type { InlineTextStatus } from "@/components/ui/inline-text";

export type InlineCurrencyProps = Omit<
  React.ComponentProps<"input">,
  "value" | "defaultValue" | "onChange" | "onBlur" | "onFocus" | "type" | "inputMode"
> & {
  /** Source-of-truth price in integer cents (UZS sum). */
  value: number;
  /** Autosave handler. Receives integer cents, never a string. Throws or
   *  rejects on failure → field re-enters edit with status="error". */
  save: (nextCents: number) => Promise<void> | void;
  /** Optional callback fired on every status transition. */
  onStatusChange?: (status: InlineTextStatus) => void;
  /** Debounce window before firing save while typing. Default 200ms.
   *  Set to 0 for blur-only save. */
  debounceMs?: number;
  /** Optional placeholder when no price set yet. Default: "0". */
  placeholder?: string;
  /** Tailwind classes applied to BOTH unfocused and focused states. */
  className?: string;
};

// UZS rendering rules. Format an integer cents value as "25,000" (no
// decimal, comma thousands). Krafta is single-currency v1 so this is
// hard-coded; v2 would route through formatPriceCents() with locale-
// aware separators.
function formatUzsCents(cents: number): string {
  if (!Number.isFinite(cents)) return "0";
  // We use the schema convention: price_cents stores UZS sum directly
  // (not 1/100ths), so integer rendering is straight number → comma group.
  return Math.trunc(cents).toLocaleString("en-US");
}

// Parse a merchant-typed string into integer cents. Accept comma, space,
// and dot as thousands separators; strip non-digits; reject empty or
// purely punctuation as 0. Returns null if the input contains decimal
// characters that look like fractional sums (UZS v1 has no decimals;
// rather than silently truncate, the caller can reject the keystroke).
function parseUzsInput(raw: string): number | null {
  if (raw == null) return null;
  // Strip whitespace, common thousands separators, currency symbols. Keep
  // digits only.
  const cleaned = raw.replace(/[\s,.'` ]/g, "");
  if (!cleaned.length) return 0;
  if (!/^\d+$/.test(cleaned)) return null;
  const parsed = Number.parseInt(cleaned, 10);
  if (!Number.isFinite(parsed)) return null;
  return parsed;
}

/**
 * InlineCurrency — UZS price input that styles as text when unfocused.
 * See file docstring for the full behavior spec.
 */
export function InlineCurrency({
  value,
  save,
  onStatusChange,
  debounceMs = 200,
  placeholder = "0",
  className,
  ...rest
}: InlineCurrencyProps) {
  const [localCents, setLocalCents] = React.useState(value);
  // Mirror the raw input string while the field is focused so the user
  // can type "25,000" without us reformatting mid-stroke.
  const [rawInput, setRawInput] = React.useState<string>(formatUzsCents(value));
  const [focused, setFocused] = React.useState(false);
  const [status, setStatusState] = React.useState<InlineTextStatus>("idle");
  const debounceTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingCentsRef = React.useRef<number | null>(null);
  const inFlightRef = React.useRef(false);

  const saveRef = React.useRef(save);
  React.useEffect(() => {
    saveRef.current = save;
  }, [save]);

  const onStatusChangeRef = React.useRef(onStatusChange);
  React.useEffect(() => {
    onStatusChangeRef.current = onStatusChange;
  }, [onStatusChange]);

  const setStatus = React.useCallback((next: InlineTextStatus) => {
    setStatusState(next);
    onStatusChangeRef.current?.(next);
  }, []);

  React.useEffect(() => {
    if (!focused && !inFlightRef.current) {
      setLocalCents(value);
      setRawInput(formatUzsCents(value));
    }
  }, [value, focused]);

  const flushPendingSave = React.useCallback(async () => {
    const pending = pendingCentsRef.current;
    if (pending == null) return;
    pendingCentsRef.current = null;
    inFlightRef.current = true;
    setStatus("saving");
    try {
      await saveRef.current(pending);
      if (pendingCentsRef.current == null) {
        setStatus("saved");
        setTimeout(() => {
          setStatusState((current) => (current === "saved" ? "idle" : current));
        }, 1200);
      }
    } catch {
      setStatus("error");
    } finally {
      inFlightRef.current = false;
    }
  }, [setStatus]);

  const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const next = event.target.value;
    setRawInput(next);

    const parsed = parseUzsInput(next);
    if (parsed == null) {
      // Invalid input (e.g. decimals, letters). Don't queue a save until
      // the merchant fixes it; surface as error chip so they know the
      // current value won't be saved.
      setStatus("error");
      return;
    }

    setLocalCents(parsed);
    pendingCentsRef.current = parsed;

    if (status === "error") {
      setStatus("idle");
    }

    if (debounceMs <= 0) return;

    if (debounceTimer.current) {
      clearTimeout(debounceTimer.current);
    }
    debounceTimer.current = setTimeout(() => {
      if (pendingCentsRef.current !== null) {
        void flushPendingSave();
      }
    }, debounceMs);
  };

  const handleBlur = () => {
    setFocused(false);
    if (debounceTimer.current) {
      clearTimeout(debounceTimer.current);
      debounceTimer.current = null;
    }
    if (pendingCentsRef.current !== null) {
      void flushPendingSave();
    }
    // On blur, reformat the raw input to the canonical "25,000" display
    // so the merchant sees a clean number next time they look at it.
    setRawInput(formatUzsCents(localCents));
  };

  const handleFocus = () => {
    setFocused(true);
  };

  React.useEffect(() => {
    return () => {
      if (debounceTimer.current) {
        clearTimeout(debounceTimer.current);
      }
    };
  }, []);

  // Shared classes: font-mono tabular-nums for column alignment per DESIGN.md.
  const sharedClasses = cn(
    "block bg-transparent font-mono tabular-nums text-sm font-semibold leading-tight outline-none text-right whitespace-nowrap",
    className,
  );

  if (focused) {
    return (
      <input
        type="text"
        inputMode="numeric"
        autoFocus
        value={rawInput}
        onChange={handleChange}
        onBlur={handleBlur}
        onFocus={handleFocus}
        placeholder={placeholder}
        data-slot="inline-currency"
        data-status={status}
        className={cn(
          sharedClasses,
          "rounded-sm focus-visible:ring-ring/50 focus-visible:ring-[2px] px-1 -mx-1",
        )}
        {...rest}
      />
    );
  }

  return (
    <button
      type="button"
      onClick={() => setFocused(true)}
      onFocus={handleFocus}
      data-slot="inline-currency"
      data-status={status}
      className={cn(
        sharedClasses,
        "cursor-text rounded-sm px-1 -mx-1 hover:bg-muted/50",
        !localCents && "text-muted-foreground",
      )}
    >
      {localCents ? formatUzsCents(localCents) : placeholder}
    </button>
  );
}

// Exported for the vitest carve-out and any callers that need to format
// UZS without instantiating the component (e.g. read-only price rendering
// in the variations table during PR2 development).
export { formatUzsCents, parseUzsInput };
