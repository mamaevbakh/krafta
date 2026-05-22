import type { Metadata } from "next";
import { Suspense } from "react";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import localFont from "next/font/local";
import "./globals.css";
import { ThemeProvider } from "@/components/theme-provider"
import { Toaster } from "@/components/ui/sonner"
import { SpeedInsights } from "@vercel/speed-insights/next"
import { Analytics } from "@vercel/analytics/next"
import { HapticsProvider } from "@/components/krafta/haptics-provider";
import { Spinner } from "@/components/ui/spinner";

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
        <Suspense
          fallback={
            <div className="min-h-svh bg-background flex items-center justify-center">
              <Spinner className="size-6 text-muted-foreground" />
            </div>
          }
        >
          <ThemeProvider
            attribute="class"
            defaultTheme="system"
            enableSystem
          >
            <HapticsProvider />
            {children}
          </ThemeProvider>
        </Suspense>
        <Toaster position="top-center" />
      </body>
    </html>
  );
}
