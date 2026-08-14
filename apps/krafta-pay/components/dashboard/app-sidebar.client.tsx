"use client";

import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import {
  BookOpen,
  ChevronsUpDown,
  CreditCard,
  FileText,
  Home,
  KeyRound,
  Layers,
  LogOut,
  Receipt,
  Repeat,
  ScrollText,
  Users,
  Wallet,
  Webhook,
} from "lucide-react";

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { BrandWordmark } from "@/components/brand/brand-wordmark";
import { EnvironmentSwitcher } from "@/components/dashboard/environment-switcher.client";
import { LanguageSwitcher } from "@/components/dashboard/language-switcher.client";
import { DitherAvatar } from "@/components/dither-kit/avatar";
import { NavMain } from "@/components/dashboard/nav-main.client";
import { signOutAction } from "@/app/actions/auth";
import { useT } from "@/lib/locales/context";
import type { MembershipOption } from "@/lib/org-memberships";
import type { PayMessageKey } from "@/lib/locales/messages";
import type { PayLocale } from "@/lib/locales/locale";

/**
 * The dashboard shell, on the shadcn sidebar primitive.
 *
 * Replaces a hand-rolled fixed aside. The primitive brings the collapse
 * behaviour, the mobile sheet, keyboard handling and the focus states for
 * free — all of which the hand-rolled version either lacked or reimplemented
 * badly.
 *
 * Nav is grouped rather than flat. A merchant looking for "who paid me" and a
 * developer looking for an API key are different people on different days, and
 * a single eleven-item list serves neither.
 */

const NAV: Array<{
  groupKey: PayMessageKey | null;
  items: Array<{ href: string; labelKey: PayMessageKey; Icon: typeof Home }>;
}> = [
  {
    groupKey: null,
    items: [{ href: "", labelKey: "nav.overview", Icon: Home }],
  },
  {
    groupKey: "nav.group.payments",
    items: [
      { href: "/payments", labelKey: "nav.payments", Icon: Receipt },
      { href: "/providers", labelKey: "nav.providers", Icon: CreditCard },
      { href: "/plans", labelKey: "nav.plans", Icon: Layers },
      { href: "/subscriptions", labelKey: "nav.subscriptions", Icon: Repeat },
      { href: "/customers", labelKey: "nav.customers", Icon: Users },
      { href: "/tax-codes", labelKey: "nav.taxCodes", Icon: FileText },
    ],
  },
  {
    groupKey: "nav.group.developers",
    items: [
      { href: "/api-keys", labelKey: "nav.apiKeys", Icon: KeyRound },
      { href: "/webhooks", labelKey: "nav.webhooks", Icon: Webhook },
      { href: "/logs", labelKey: "nav.logs", Icon: ScrollText },
      { href: "/docs", labelKey: "nav.docs", Icon: BookOpen },
    ],
  },
  {
    groupKey: "nav.group.account",
    items: [{ href: "/billing", labelKey: "nav.billing", Icon: Wallet }],
  },
];

export function AppSidebar({
  memberships,
  userEmail,
  environment,
  locale,
}: {
  memberships: MembershipOption[];
  userEmail: string | null;
  environment: string;
  locale: PayLocale;
}) {
  const t = useT();
  const pathname = usePathname();
  const router = useRouter();

  // The org lives in the path; a prop would just be a second source of truth
  // that can disagree with the URL after a client-side navigation.
  const orgSlug = pathname.match(/^\/dashboard\/org\/([^/]+)/)?.[1];
  const activeOrg =
    memberships.find((m) => m.orgSlug === (orgSlug ? decodeURIComponent(orgSlug) : null)) ??
    memberships[0] ??
    null;
  const base = activeOrg ? `/dashboard/org/${activeOrg.orgSlug}` : "/dashboard";

  return (
    <Sidebar collapsible="offcanvas" variant="inset">
      <SidebarHeader>
        {/* The block's brand row, verbatim apart from what sits inside it.
            Home is THIS organisation, never bare /dashboard — that path carries
            no org and resolves to the merchant's first membership, which
            silently moves anyone working in a second one. */}
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              className="data-[slot=sidebar-menu-button]:p-1.5!"
              render={<Link href={base} />}
            >
              <BrandWordmark text="Krafta•Pay" className="text-base" />
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
        <div className="px-2">
          <EnvironmentSwitcher environment={environment === "test" ? "test" : "live"} />
        </div>

        {activeOrg ? (
          <SidebarMenu>
            <SidebarMenuItem>
              {memberships.length > 1 ? (
                <DropdownMenu>
                  <DropdownMenuTrigger
                    render={
                      <SidebarMenuButton
                        size="lg"
                        className="data-[state=open]:bg-sidebar-accent"
                      >
                        <DitherAvatar
                          name={activeOrg.orgId}
                          className="size-6 shrink-0 rounded-md"
                        />
                        <span className="grid flex-1 text-left leading-tight">
                          <span className="truncate font-medium">{activeOrg.orgName}</span>
                          <span className="truncate text-xs text-muted-foreground">
                            {activeOrg.role}
                          </span>
                        </span>
                        <ChevronsUpDown className="ml-auto size-4" aria-hidden />
                      </SidebarMenuButton>
                    }
                  />
                  <DropdownMenuContent align="start" className="w-56">
                    {/* Base UI throws if a label sits outside a group. */}
                    <DropdownMenuGroup>
                      <DropdownMenuLabel className="text-xs text-muted-foreground">
                        {t("nav.switchOrg")}
                      </DropdownMenuLabel>
                    </DropdownMenuGroup>
                    {memberships.map((m) => (
                      <DropdownMenuItem
                        key={m.orgId}
                        onClick={() => router.push(`/dashboard/org/${m.orgSlug}`)}
                        className="gap-2"
                      >
                        <DitherAvatar name={m.orgId} className="size-5 shrink-0 rounded-sm" />
                        <span className="truncate">{m.orgName}</span>
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              ) : (
                <SidebarMenuButton size="lg" className="pointer-events-none">
                  <DitherAvatar
                    name={activeOrg.orgId}
                    className="size-6 shrink-0 rounded-md"
                  />
                  <span className="grid flex-1 text-left leading-tight">
                    <span className="truncate font-medium">{activeOrg.orgName}</span>
                    <span className="truncate text-xs text-muted-foreground">
                      {activeOrg.role}
                    </span>
                  </span>
                </SidebarMenuButton>
              )}
            </SidebarMenuItem>
          </SidebarMenu>
        ) : null}
      </SidebarHeader>

      <SidebarContent>
        <NavMain
          items={NAV[0].items.map((i) => ({
            titleKey: i.labelKey,
            url: `${base}${i.href}`,
            icon: <i.Icon aria-hidden />,
          }))}
          createHref={`${base}/payments`}
          supportHref={`${base}/docs`}
        />
        {NAV.slice(1).map((group, i) => (
          <SidebarGroup key={group.groupKey ?? `g${i}`} className={i === NAV.length - 2 ? "mt-auto" : undefined}>
            {group.groupKey ? (
              <SidebarGroupLabel>{t(group.groupKey)}</SidebarGroupLabel>
            ) : null}
            <SidebarGroupContent>
              <SidebarMenu>
                {group.items.map((item) => {
                  const href = `${base}${item.href}`;
                  const active = item.href === "" ? pathname === base : pathname.startsWith(href);
                  const Icon = item.Icon;
                  return (
                    <SidebarMenuItem key={item.href}>
                      <SidebarMenuButton isActive={active} render={<Link href={href} />}>
                        <Icon aria-hidden />
                        <span>{t(item.labelKey)}</span>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>

      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <LanguageSwitcher locale={locale} />
          </SidebarMenuItem>
          <SidebarMenuItem>
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <SidebarMenuButton size="lg" className="data-[state=open]:bg-sidebar-accent">
                    <DitherAvatar
                      name={userEmail ?? "krafta"}
                      className="size-6 shrink-0 rounded-md"
                    />
                    <span className="grid flex-1 text-left leading-tight">
                      <span className="truncate text-sm">{userEmail ?? "—"}</span>
                    </span>
                    <ChevronsUpDown className="ml-auto size-4" aria-hidden />
                  </SidebarMenuButton>
                }
              />
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuGroup>
                  <DropdownMenuLabel className="truncate text-xs text-muted-foreground">
                    {userEmail ?? "—"}
                  </DropdownMenuLabel>
                </DropdownMenuGroup>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={() => {
                    void signOutAction();
                  }}
                  className="gap-2"
                >
                  <LogOut className="size-4" aria-hidden />
                  {t("nav.signOut")}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
