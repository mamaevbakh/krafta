import "./globals.css";
import type { Metadata } from "next";
import type { ReactNode } from "react";
import { GeistSans } from "geist/font/sans";

export const metadata: Metadata = {
  title: "Shop",
  description: "Powered by Krafta.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={GeistSans.className}>
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
