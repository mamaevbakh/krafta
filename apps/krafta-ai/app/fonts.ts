import localFont from "next/font/local"

/**
 * Helvetica Neue Bold is the brand's voice and nothing else's — the wordmark
 * only, never body text, headings or UI labels (DESIGN.md §Typography). The
 * deliberate dissonance against Geist is the point.
 *
 * Self-hosted: no external font CDN in production.
 *
 * The filename is lowercase on purpose. `apps/krafta` imports the same file as
 * "HelveticaNeue-Bold.woff2" while git tracks it lowercase — harmless on macOS
 * (`core.ignorecase=true`) and a resolution failure on a case-sensitive Linux
 * builder. Match the bytes on disk exactly.
 */
export const brandFont = localFont({
  src: [
    {
      path: "../public/fonts/helveticaneue-bold.woff2",
      weight: "600",
      style: "normal",
    },
  ],
  variable: "--font-krafta-brand",
  display: "swap",
})
