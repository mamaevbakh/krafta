import type { Metadata } from "next"
import { Geist, Geist_Mono } from "next/font/google"

import "./globals.css"
import { brandFont } from "./fonts"
import { ThemeProvider } from "@/components/theme-provider"
import { cn } from "@/lib/utils"

// Geist Sans for everything, Geist Mono reserved for money, IDs and tabular
// numerals — the same split the rest of Krafta uses (see DESIGN.md).
const geistSans = Geist({ subsets: ["latin"], variable: "--font-sans" })
const geistHeading = Geist({ subsets: ["latin"], variable: "--font-heading" })
const geistMono = Geist_Mono({ subsets: ["latin"], variable: "--font-mono" })

export const metadata: Metadata = {
  title: "Krafta AI",
  description:
    "Every company in Uzbekistan builds its own AI agents — pick a template or describe it in your own words.",
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={cn(
        "antialiased",
        geistSans.variable,
        geistHeading.variable,
        geistMono.variable,
        brandFont.variable
      )}
    >
      <body>
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  )
}
