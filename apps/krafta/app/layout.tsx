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

const KraftaBrandFont = localFont({
  src: "../public/fonts/helveticaneue-bold.woff2",
  variable: "--font-krafta-brand",
  display: "swap",
});


export const metadata: Metadata = {
  title: "Krafta",
  description: "Create Digital Catalogs Seamlessly",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
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
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
        >
          <HapticsProvider />
          {children}
        </ThemeProvider>
        <Toaster position="top-center" />
      </body>
    </html>
  );
}
