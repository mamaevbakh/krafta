import { cn } from "@/lib/utils";

/**
 * ProgressiveBlur — a sticky-chrome backdrop that reads as a clean surface and
 * dissolves at its bottom edge, so scrolling content slides under it without a
 * hard line.
 *
 * Over a dense product-photo grid a translucent multi-layer blur looks murky
 * (photos smear through behind the tabs). So the surface is mostly OPAQUE
 * (`bg-background`, tabs stay crisp, no smear) and a mask fades only the bottom
 * edge. A single light blur, also faded, gives the content a soft out-of-focus
 * dissolve at the edge. Alpha falloff, no color gradient, no shadow — DESIGN.md.
 *
 * The fade is a FIXED pixel band at the bottom (not a %), so the same component
 * works whether it covers just the nav or also the Telegram safe-area strip
 * above it (the caller stretches it up via the `top` offset when stuck).
 *
 * Place it absolutely behind sticky chrome; keep content above (`relative z-10`).
 */

const SURFACE_MASK =
  "linear-gradient(to bottom, #000 0%, #000 calc(100% - 28px), transparent 100%)";
const BLUR_MASK =
  "linear-gradient(to bottom, #000 0%, #000 calc(100% - 40px), transparent 100%)";

export function ProgressiveBlur({ className }: { className?: string }) {
  return (
    <div className={cn("pointer-events-none", className)} aria-hidden>
      {/* Near-opaque surface — keeps tabs crisp over photos and gives the
          Telegram safe-area strip a clean bar to sit on; mask dissolves the
          bottom edge so there's no hard line. */}
      <div
        className="absolute inset-0 bg-background/92"
        style={{ maskImage: SURFACE_MASK, WebkitMaskImage: SURFACE_MASK }}
      />
      {/* Light blur, faded at the bottom — content goes soft-focus as it slides
          under the chrome (and behind the Telegram floating controls). */}
      <div
        className="absolute inset-0"
        style={{
          backdropFilter: "blur(8px)",
          WebkitBackdropFilter: "blur(8px)",
          maskImage: BLUR_MASK,
          WebkitMaskImage: BLUR_MASK,
        }}
      />
    </div>
  );
}
