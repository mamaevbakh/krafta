import { cn } from "@/lib/utils";

/**
 * ProgressiveBlur — the iOS-style gradient blur where the effect is heaviest at
 * the top and fades to clear at the bottom, so scrolling content dissolves
 * under the chrome instead of meeting a hard blur edge.
 *
 * It stacks several `backdrop-filter` layers at increasing blur radius, each
 * masked to a shrinking window from the top, so the layers sum to a smooth
 * falloff. A faint, mask-faded background tint rides along purely for text
 * legibility over busy photos. No color gradient, no shadow — this is alpha
 * falloff, consistent with DESIGN.md (borders + weight do hierarchy).
 *
 * Place it as an absolutely-positioned layer behind sticky chrome and keep the
 * content above it (`relative z-10`).
 */

type Layer = { blur: number; mask: string };

// Heaviest blur (top) is masked to a short window; lighter blur reaches further
// down. Each mask fades (alpha) rather than hard-cutting, for a smooth gradient.
const LAYERS: Layer[] = [
  { blur: 1, mask: "linear-gradient(to bottom, #000 0%, #000 60%, transparent 88%)" },
  { blur: 2, mask: "linear-gradient(to bottom, #000 0%, #000 46%, transparent 70%)" },
  { blur: 4, mask: "linear-gradient(to bottom, #000 0%, #000 32%, transparent 54%)" },
  { blur: 8, mask: "linear-gradient(to bottom, #000 0%, #000 20%, transparent 40%)" },
  { blur: 14, mask: "linear-gradient(to bottom, #000 0%, #000 10%, transparent 26%)" },
];

const TINT_MASK = "linear-gradient(to bottom, #000 0%, #000 55%, transparent 92%)";

export function ProgressiveBlur({ className }: { className?: string }) {
  return (
    <div className={cn("pointer-events-none overflow-hidden", className)} aria-hidden>
      {/* Legibility tint — flat surface color faded by a mask (alpha, not a
          color gradient). Keeps muted tab text readable over photos. */}
      <div
        className="absolute inset-0 bg-background/55"
        style={{ maskImage: TINT_MASK, WebkitMaskImage: TINT_MASK }}
      />
      {LAYERS.map((layer) => (
        <div
          key={layer.blur}
          className="absolute inset-0"
          style={{
            backdropFilter: `blur(${layer.blur}px)`,
            WebkitBackdropFilter: `blur(${layer.blur}px)`,
            maskImage: layer.mask,
            WebkitMaskImage: layer.mask,
          }}
        />
      ))}
    </div>
  );
}
