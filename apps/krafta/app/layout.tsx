import type { Metadata } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import localFont from "next/font/local";
import "./globals.css";
import { ThemeProvider } from "@/components/theme-provider"
import { Toaster } from "@/components/ui/sonner"
import { SpeedInsights } from "@vercel/speed-insights/next"
import { Analytics } from "@vercel/analytics/next"
import { HapticsProvider } from "@/components/krafta/haptics-provider";
import { PostHogProvider } from "@/components/analytics/posthog-provider";

const KraftaBrandFont = localFont({
  src: "../public/fonts/helveticaneue-bold.woff2",
  variable: "--font-krafta-brand",
  display: "swap",
});


export const metadata: Metadata = {
  // Base URL for resolving every relative canonical / OG URL in child pages'
  // metadata (e.g. `alternates.canonical: "/pricing"` → absolute). The landing
  // sets its own metadataBase too; this covers all other routes.
  metadataBase: new URL("https://www.krafta.uz"),
  title: "Krafta",
  description:
    "Online storefront, orders, and QR menu for cafes, restaurants, and shops — no commission on sales.",
};

// Search-console ownership verification. Rendered as LITERAL <meta> in the
// root <head> below — NOT via the Metadata API — because the landing's
// metadata is request-dynamic (geo/lang) under Suspense + cacheComponents,
// which streams Metadata-API tags into the <body> where only JS-rendering
// crawlers hoist them. Yandex's verification robot doesn't run JS, so the tag
// must be in the static <head> shell that flushes first. Static + site-wide,
// so a literal is the correct home for it.
// One code per verified Google Search Console property (Google supports
// several google-site-verification tags on a page): krafta.uz is the primary,
// krafta.org is the retired-but-historically-verified domain.
const GOOGLE_SITE_VERIFICATIONS = [
  "NpBoxpr9Koj0qWBS80EbyAdAlsGGBb_FfoLntVUIVL4", // krafta.uz (primary)
  "zMYynJIPuONjvxBSD2pMTY8xS7sRYR8rH1eQztrG4Bg", // krafta.org (legacy)
];
const YANDEX_VERIFICATION = "9e592216b654ce12";

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* Literal in the static <head> so non-JS crawlers (Yandex's
            verification robot) see them — see the note by the constants. */}
        {GOOGLE_SITE_VERIFICATIONS.map((code) => (
          <meta key={code} name="google-site-verification" content={code} />
        ))}
        <meta name="yandex-verification" content={YANDEX_VERIFICATION} />
      </head>
      <body
        className={`${GeistSans.variable} ${GeistMono.variable} ${KraftaBrandFont.variable} font-sans antialiased`}
      >
        <SpeedInsights />
        <Analytics />
        {/* No Suspense here, on purpose. A root-level boundary makes the
            html+fallback shell flush (and commit HTTP 200) before ANY page
            can run notFound()/redirect with a real status code — every
            unknown storefront slug became a soft-404. Routes that stream
            own their boundary below the status decision (loading.tsx or an
            explicit <Suspense> in the page). */}
        <PostHogProvider>
          <ThemeProvider
            attribute="class"
            defaultTheme="system"
            enableSystem
          >
            <HapticsProvider />
            {children}
          </ThemeProvider>
        </PostHogProvider>
        <Toaster position="top-center" />
      </body>
    </html>
  );
}
