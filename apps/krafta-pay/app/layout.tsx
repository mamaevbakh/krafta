import type { Metadata } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import localFont from "next/font/local";
import "./globals.css";
import { ThemeProvider } from "@/components/theme-provider"

// The wordmark's face. Self-hosted, and the only place Helvetica Neue is used —
// <BrandWordmark> reads it through Tailwind's `font-brand`, which globals.css
// maps to this variable. Same file and same variable name as the other apps, so
// "Krafta•Pay" is set identically wherever it appears.
const KraftaBrandFont = localFont({
  src: "../public/fonts/helveticaneue-bold.woff2",
  variable: "--font-krafta-brand",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Krafta•Pay",
  description: "Payment Orchestration for Digital Commerce and Developers",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${GeistSans.variable} ${GeistMono.variable} ${KraftaBrandFont.variable} font-sans antialiased`}
      ><ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
        >
        {children}
        </ThemeProvider>
      </body>
    </html>
  );
}
