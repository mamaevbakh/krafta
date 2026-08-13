"use client"

import { usePathname, useRouter } from "next/navigation"
import { Globe } from "lucide-react"

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { SidebarMenuButton } from "@/components/ui/sidebar"
import { LOCALES, LOCALE_LABELS, type Locale } from "@/lib/i18n"

export function LocaleSwitcher({ locale }: { locale: Locale }) {
  const pathname = usePathname()
  const router = useRouter()

  // Swap only the first segment so the switcher keeps you on the same screen —
  // changing language should never bounce you back to the dashboard.
  function switchTo(next: Locale) {
    const rest = pathname.split("/").slice(2).join("/")
    router.push(`/${next}${rest ? `/${rest}` : ""}`)
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <SidebarMenuButton>
            <Globe />
            <span>{LOCALE_LABELS[locale]}</span>
          </SidebarMenuButton>
        }
      />
      <DropdownMenuContent side="top" align="start" className="w-40">
        {LOCALES.map((value) => (
          <DropdownMenuItem key={value} onClick={() => switchTo(value)}>
            {LOCALE_LABELS[value]}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
