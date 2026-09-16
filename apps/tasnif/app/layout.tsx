import type { Metadata } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import "./globals.css";

export const metadata: Metadata = {
  title: "Tasnif — поиск ИКПУ",
  description:
    "Бесплатный открытый поиск кодов ИКПУ по смыслу: на русском, узбекском и английском.",
  // Not launched. A placeholder indexed under krafta.uz would outrank the real
  // site later and teach Google the wrong snippet; lift this at launch.
  robots: { index: false, follow: false },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ru">
      <body
        className={`${GeistSans.variable} ${GeistMono.variable} font-sans antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
