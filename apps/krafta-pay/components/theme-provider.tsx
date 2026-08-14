"use client"

import * as React from "react"
import { ThemeProvider as NextThemesProvider } from "next-themes"

// `children` is declared explicitly: next-themes' own props type stopped
// implying it under React 19's types, and inheriting it silently is what broke
// the build on a clean install while a warm local tree still compiled.
export function ThemeProvider({
  children,
  ...props
}: React.ComponentProps<typeof NextThemesProvider> & {
  children: React.ReactNode
}) {
  return <NextThemesProvider {...props}>{children}</NextThemesProvider>
}