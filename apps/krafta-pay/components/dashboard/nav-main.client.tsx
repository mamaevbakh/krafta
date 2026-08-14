"use client";

import Link from "next/link";
import { CirclePlusIcon, LifeBuoyIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import { useT } from "@/lib/locales/context";
import type { PayMessageKey } from "@/lib/locales/messages";

/**
 * The block's NavMain, kept as-is structurally.
 *
 * Its "Quick Create" primary button becomes «Новый платёж» — the one thing a
 * merchant starts from this screen — and its Inbox icon button becomes support,
 * which is the only other always-available action this product has. The
 * classNames, spacing and collapse behaviour are the block's, untouched.
 */
export function NavMain({
  items,
  createHref,
  supportHref,
}: {
  items: { titleKey: PayMessageKey; url: string; icon?: React.ReactNode }[];
  createHref: string;
  supportHref: string;
}) {
  const t = useT();

  return (
    <SidebarGroup>
      <SidebarGroupContent className="flex flex-col gap-2">
        <SidebarMenu>
          <SidebarMenuItem className="flex items-center gap-2">
            <SidebarMenuButton
              tooltip={t("nav.quickCreate")}
              className="min-w-8 bg-primary text-primary-foreground duration-200 ease-linear hover:bg-primary/90 hover:text-primary-foreground active:bg-primary/90 active:text-primary-foreground"
              render={<Link href={createHref} />}
            >
              <CirclePlusIcon />
              <span>{t("nav.quickCreate")}</span>
            </SidebarMenuButton>
            {/* nativeButton={false} because this renders as an anchor; Base UI
                warns (loudly, at runtime) when a button-role component is not a
                real <button> and has not been told so. */}
            <Button
              size="icon"
              className="size-8 group-data-[collapsible=icon]:opacity-0"
              variant="outline"
              nativeButton={false}
              render={<Link href={supportHref} />}
            >
              <LifeBuoyIcon />
              <span className="sr-only">{t("nav.support")}</span>
            </Button>
          </SidebarMenuItem>
        </SidebarMenu>
        <SidebarMenu>
          {items.map((item) => (
            <SidebarMenuItem key={item.url}>
              <SidebarMenuButton
                tooltip={t(item.titleKey)}
                render={<Link href={item.url} />}
              >
                {item.icon}
                <span>{t(item.titleKey)}</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          ))}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  );
}
