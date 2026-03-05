"use client"

import * as React from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"

import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from "@/components/ui/sidebar"
import { GalleryVerticalEndIcon } from "lucide-react"

type AppSidebarDoc = {
  group: string
  title: string
  href: string
  order: number
}

type AppSidebarProps = React.ComponentProps<typeof Sidebar> & {
  docs: AppSidebarDoc[]
}

export function AppSidebar({ docs, ...props }: AppSidebarProps) {
  const pathname = usePathname()

  const groupedDocs = React.useMemo(() => {
    const grouped = new Map<string, AppSidebarDoc[]>()
    for (const doc of docs) {
      const groupDocs = grouped.get(doc.group) ?? []
      groupDocs.push(doc)
      grouped.set(doc.group, groupDocs)
    }

    return Array.from(grouped.entries()).map(([group, items]) => ({
      group,
      items: items.sort((a, b) => a.order - b.order || a.title.localeCompare(b.title)),
    }))
  }, [docs])

  return (
    <Sidebar {...props}>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" render={<Link href="/docs" />}>
              <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
                <GalleryVerticalEndIcon className="size-4" />
              </div>
              <div className="flex flex-col gap-0.5 leading-none">
                <span className="font-medium">Krafta Docs</span>
                <span>Markdoc</span>
              </div>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        {groupedDocs.map((group) => (
          <SidebarGroup key={group.group}>
            <SidebarGroupLabel>{group.group}</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {group.items.map((item) => (
                  <SidebarMenuItem key={item.href}>
                    <SidebarMenuButton
                      isActive={pathname === item.href}
                      render={<Link href={item.href} />}
                      tooltip={item.title}
                    >
                      {item.title}
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>
      <SidebarRail />
    </Sidebar>
  )
}
