import "./globals.css";
import type { Metadata } from "next";
import type { ReactNode } from "react";
import { GeistSans } from "geist/font/sans";

export const metadata: Metadata = {
  title: "Shop",
  description: "Powered by Krafta.",
};

// Render every page at request time so the live shop always reflects the
// current catalog (and so `next build` never tries to fetch the catalog at
// build time). Keep this — it's what makes the deployed shop stay in sync with
// the merchant's commerce data. Applies to all routes under this layout.
export const dynamic = "force-dynamic";

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={GeistSans.className}>
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
