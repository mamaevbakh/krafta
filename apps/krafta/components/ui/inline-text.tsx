"use client";

/**
 * inline-text.tsx — focus-styled inline-editable text primitive (KRA-35 PR1 / ER3, DR3).
 *
 * STATUS (KRA-35 Iter 2 / OQ1): no canvas-side consumers. Iter 2 walked
 * back the inline-edit model in favor of explicit-Save in a fullscreen
 * EditorSheet (per Pass 2 D2C). This primitive remains in the repo as a
 * shipped, tested primitive for future surfaces: category rename in
 * `/items/categories`, settings forms, etc. Don't introduce a competing
 * primitive — extend this one.
 *
 * Renders as plain text when unfocused, native input when focused. Optimistic
 * local state for instant visual feedback as the merchant types; debounced
 * autosave on change (200ms) plus a flush on blur. Per DR3 (modeless edit
 * affordance): no persistent indicator — cursor changes to text-caret on
 * hover, light `bg-muted/50` tint, surrounding chrome ("Library" header,
 * Canvas view toggle, locale tabs) signals "editor" so per-field cues aren't
 * needed. Touch users tap to focus directly.
 *
 * The component is decoupled from the field's transport: caller passes a
 * `save(value)` callback that returns a Promise. Save lifecycle:
 *   typing → optimistic local update (immediate, no network)
 *   on blur → flush pending save (skip if value unchanged)
 *   save resolves → onSaved() (optional)
 *   save rejects → reEnterEdit + show error chip (caller renders via
 *                  `errorSlot` prop, sees `status` value)
 *
 * The component itself does NOT render the loading/saved/error indicator —
 * that's a sibling element rendered by the inspector / canvas card so each
 * surface can position the chip in its own layout. The component exposes
 * `status` via the optional `onStatusChange` callback for the parent to
 * render against.
 *
 * Why a custom primitive (not just <Input>): the merchant must SEE text
 * styled like the customer view when not editing, and TYPE in an input
 * when focused. Wrapping shadcn's <Input> with focus/blur transitions
 * achieves this without a contenteditable rabbit hole.
 */

import * as React from "react";
import { cn } from "@/lib/utils";

export type InlineTextStatus = "idle" | "saving" | "saved" | "error";

export type InlineTextProps = Omit<
  React.ComponentProps<"input">,
  "value" | "defaultValue" | "onChange" | "onBlur" | "onFocus" | "type"
> & {
  /** Source-of-truth value from the server. */
  value: string;
  /** Autosave handler. Throws (or rejects) on failure → field re-enters
   *  edit with status="error". */
  save: (next: string) => Promise<void> | void;
  /** Optional callback fired on every status transition. The parent renders
   *  the saving/saved/error indicator chip. */
  onStatusChange?: (status: InlineTextStatus) => void;
  /** Debounce window before firing save while typing. Default 200ms.
   *  Set to 0 to disable debounced-while-typing (blur-only save). */
  debounceMs?: number;
  /** Optional placeholder when the value is empty. */
  placeholder?: string;
  /** When true, the unfocused text-style state uses italic styling. Used
   *  by callers to signal "this is a fallback from another locale" per P2
   *  / useLocalizedField. */
  italic?: boolean;
  /** Tailwind classes applied to BOTH the unfocused text and the focused
   *  input — keep them visually identical so the focus transition is just
   *  the affordance, not a layout shift. */
  className?: string;
};

/**
 * InlineText — focus-styled text input that styles as plain text when
 * unfocused. See the file docstring for the full behavior spec.
 */
export function InlineText({
  value,
  save,
  onStatusChange,
  debounceMs = 200,
  placeholder,
  italic = false,
  className,
  ...rest
}: InlineTextProps) {
  // Local state mirrors the source-of-truth `value` so typing feels
  // instant (optimistic). When the server `value` prop changes (e.g.
  // after revalidation), we sync the local state so the field reflects
  // truth.
  const [local, setLocal] = React.useState(value);
  const [focused, setFocused] = React.useState(false);
  const [status, setStatusState] = React.useState<InlineTextStatus>("idle");
  const debounceTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingValueRef = React.useRef<string | null>(null);
  const inFlightRef = React.useRef(false);

  // Keep callback ref stable for the debounced fire so the effect cleanup
  // doesn't churn the timer.
  const saveRef = React.useRef(save);
  React.useEffect(() => {
    saveRef.current = save;
  }, [save]);

  const onStatusChangeRef = React.useRef(onStatusChange);
  React.useEffect(() => {
    onStatusChangeRef.current = onStatusChange;
  }, [onStatusChange]);

  // Helper to update status + notify parent in lockstep.
  const setStatus = React.useCallback((next: InlineTextStatus) => {
    setStatusState(next);
    onStatusChangeRef.current?.(next);
  }, []);

  // Server value changed under us (revalidation, another tab edited).
  // Mirror it locally — unless the user is mid-type. Mid-type, we trust
  // the local optimistic state and let the user finish; the autosave flush
  // will reconcile.
  React.useEffect(() => {
    if (!focused && !inFlightRef.current) {
      setLocal(value);
    }
    // We deliberately depend only on `value` and `focused`. inFlightRef
    // is a ref, not state, so it's a stable read.
  }, [value, focused]);

  const flushPendingSave = React.useCallback(async () => {
    const pending = pendingValueRef.current;
    if (pending == null) return;
    pendingValueRef.current = null;
    inFlightRef.current = true;
    setStatus("saving");
    try {
      await saveRef.current(pending);
      // Don't transition to "saved" if the user changed the value again
      // mid-flight — a new save will fire on the next blur/debounce.
      if (pendingValueRef.current == null) {
        setStatus("saved");
        // Auto-clear "saved" after a beat so the indicator doesn't linger.
        setTimeout(() => {
          setStatusState((current) => (current === "saved" ? "idle" : current));
        }, 1200);
      }
    } catch {
      // Re-enter edit with error chip. Parent renders the chip; we just
      // surface the status. Local state already holds the unsaved value.
      setStatus("error");
    } finally {
      inFlightRef.current = false;
    }
  }, [setStatus]);

  const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const next = event.target.value;
    setLocal(next);
    pendingValueRef.current = next;

    // Clear pre-existing error as soon as the user types again — they're
    // taking action to recover.
    if (status === "error") {
      setStatus("idle");
    }

    if (debounceMs <= 0) return;

    if (debounceTimer.current) {
      clearTimeout(debounceTimer.current);
    }
    debounceTimer.current = setTimeout(() => {
      if (pendingValueRef.current !== null) {
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
    if (pendingValueRef.current !== null) {
      void flushPendingSave();
    }
  };

  const handleFocus = () => {
    setFocused(true);
  };

  // Cleanup pending timer on unmount.
  React.useEffect(() => {
    return () => {
      if (debounceTimer.current) {
        clearTimeout(debounceTimer.current);
      }
    };
  }, []);

  // Both states share these classes so the focus transition is the
  // affordance, not a font change or layout shift. Italic toggle is
  // applied when the field renders a fallback from a different locale.
  const sharedClasses = cn(
    "block w-full bg-transparent text-sm font-medium leading-tight outline-none",
    italic && "italic",
    className,
  );

  if (focused) {
    return (
      <input
        type="text"
        autoFocus
        value={local}
        onChange={handleChange}
        onBlur={handleBlur}
        onFocus={handleFocus}
        placeholder={placeholder}
        data-slot="inline-text"
        data-status={status}
        className={cn(
          sharedClasses,
          // Show the focus ring inline; matches shadcn Input visual.
          "rounded-sm focus-visible:ring-ring/50 focus-visible:ring-[2px] px-1 -mx-1",
        )}
        {...rest}
      />
    );
  }

  // Unfocused: render as text. Click activates focus directly via the
  // <button>-style affordance. Hover state via group/peer or :hover.
  return (
    <button
      type="button"
      onClick={() => setFocused(true)}
      onFocus={handleFocus}
      data-slot="inline-text"
      data-status={status}
      className={cn(
        sharedClasses,
        // Modeless edit affordance per DR3: cursor changes to text on hover,
        // subtle muted tint on hover. No persistent indicator.
        "cursor-text rounded-sm px-1 -mx-1 hover:bg-muted/50 text-left",
        // Placeholder rendering when value is empty.
        !local && "text-muted-foreground",
      )}
    >
      {local || placeholder || " "}
    </button>
  );
}
