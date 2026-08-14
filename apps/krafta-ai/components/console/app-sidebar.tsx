"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import {
  BadgeCheck,
  Boxes,
  Check,
  ChevronsUpDown,
  LayoutGrid,
  Library,
  LogOut,
  ReceiptText,
  ScrollText,
  Sparkles,
} from "lucide-react"

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar"
import { BrandWordmark } from "@/components/brand/brand-wordmark"
import { LocaleSwitcher } from "@/components/console/locale-switcher"
import { selectOrg, signOut } from "@/lib/actions/session"
import type { Org } from "@/lib/orgs"
import type { Dict, Locale } from "@/lib/i18n"

type NavItem = {
  href: string
  label: string
  icon: React.ComponentType<{ className?: string }>
  badge?: number
}

export function AppSidebar({
  locale,
  dict,
  orgs,
  currentOrg,
  userEmail,
  pendingApprovals,
}: {
  locale: Locale
  dict: Dict
  orgs: Org[]
  currentOrg: Org | null
  userEmail: string
  pendingApprovals: number
}) {
  const pathname = usePathname()
  const base = `/${locale}`

  const build: NavItem[] = [
    { href: base, label: dict.nav.overview, icon: LayoutGrid },
    { href: `${base}/agents`, label: dict.nav.agents, icon: Sparkles },
    { href: `${base}/knowledge`, label: dict.nav.knowledge, icon: Library },
    { href: `${base}/templates`, label: dict.nav.templates, icon: Boxes },
  ]

  const operate: NavItem[] = [
    {
      href: `${base}/approvals`,
      label: dict.nav.approvals,
      icon: BadgeCheck,
      badge: pendingApprovals,
    },
    { href: `${base}/audit`, label: dict.nav.audit, icon: ScrollText },
    { href: `${base}/usage`, label: dict.nav.usage, icon: ReceiptText },
  ]

  // `/en` must not light up on `/en/agents`, so the root is exact-matched and
  // everything else matches its subtree.
  function isActive(href: string) {
    return href === base ? pathname === base : pathname.startsWith(href)
  }

  function renderGroup(label: string, items: NavItem[]) {
    return (
      <SidebarGroup>
        <SidebarGroupLabel>{label}</SidebarGroupLabel>
        <SidebarGroupContent>
          <SidebarMenu>
            {items.map((item) => (
              <SidebarMenuItem key={item.href}>
                <SidebarMenuButton
                  isActive={isActive(item.href)}
                  render={<Link href={item.href} />}
                >
                  <item.icon />
                  <span>{item.label}</span>
                </SidebarMenuButton>
                {item.badge ? (
                  <SidebarMenuBadge className="font-mono tabular-nums">
                    {item.badge}
                  </SidebarMenuBadge>
                ) : null}
              </SidebarMenuItem>
            ))}
          </SidebarMenu>
        </SidebarGroupContent>
      </SidebarGroup>
    )
  }

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <SidebarMenuButton size="lg">
                    <div className="flex aspect-square size-8 items-center justify-center rounded-md bg-foreground text-background">
                      <span className="text-sm font-bold tracking-tight">K</span>
                    </div>
                    <div className="grid flex-1 text-left leading-tight">
                      <BrandWordmark className="truncate text-sm" />
                      <span className="truncate text-xs text-muted-foreground">
                        {currentOrg?.name ?? dict.auth.noOrgs}
                      </span>
                    </div>
                    <ChevronsUpDown className="ml-auto size-4 opacity-60" />
                  </SidebarMenuButton>
                }
              />
              <DropdownMenuContent align="start" className="w-60">
                {/*
                  DropdownMenuLabel is Base UI's Menu.GroupLabel and throws
                  "MenuGroupContext is missing" outside a Group. Radix's Label
                  is standalone — do not drop the wrapper when porting.
                */}
                <DropdownMenuGroup>
                  <DropdownMenuLabel>{dict.auth.switchOrg}</DropdownMenuLabel>
                  {orgs.map((org) => (
                    <DropdownMenuItem
                      key={org.id}
                      onClick={() => selectOrg(org.id)}
                    >
                      <span className="truncate">{org.name}</span>
                      {org.id === currentOrg?.id ? (
                        <Check className="ml-auto size-4" />
                      ) : null}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuGroup>
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        {renderGroup(dict.nav.build, build)}
        {renderGroup(dict.nav.operate, operate)}
      </SidebarContent>

      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <LocaleSwitcher locale={locale} />
          </SidebarMenuItem>
          <SidebarMenuItem>
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <SidebarMenuButton>
                    <div className="flex size-5 items-center justify-center rounded-full bg-muted text-[10px] font-medium uppercase">
                      {userEmail.slice(0, 1)}
                    </div>
                    <span className="truncate">{userEmail}</span>
                  </SidebarMenuButton>
                }
              />
              <DropdownMenuContent side="top" align="start" className="w-60">
                <DropdownMenuGroup>
                  <DropdownMenuLabel className="truncate font-normal text-muted-foreground">
                    {userEmail}
                  </DropdownMenuLabel>
                </DropdownMenuGroup>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => signOut(locale)}>
                  <LogOut />
                  {dict.auth.signOut}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  )
}
