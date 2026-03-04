import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Krafta Auth",
  description: "Centralized authentication for Krafta products",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
