"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useSearchParams, useRouter } from "next/navigation";
import {
  BookText,
  ChevronsUpDown,
  CreditCard,
  Home,
  KeyRound,
  Layers,
  Menu,
  Receipt,
  Repeat,
  ScrollText,
  X,
  type LucideIcon,
} from "lucide-react";
import type { MembershipOption } from "@/lib/org-memberships";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { BrandWordmark } from "@/components/brand/brand-wordmark";
import { signOutAction } from "@/app/actions/auth";

type NavItem = {
  href: string;
  title: string;
  Icon: LucideIcon;
  orgScoped: boolean;
  exact?: boolean;
};

type NavGroup = { label: string | null; items: NavItem[] };

const NAV_GROUPS: NavGroup[] = [
  {
    label: null,
    items: [{ href: "/dashboard", title: "Overview", Icon: Home, orgScoped: false, exact: true }],
  },
  {
    label: "Payments",
    items: [
      { href: "/dashboard/providers", title: "Providers", Icon: CreditCard, orgScoped: true },
      { href: "/dashboard/plans", title: "Plans", Icon: Layers, orgScoped: true },
      { href: "/dashboard/subscriptions", title: "Subscriptions", Icon: Repeat, orgScoped: true },
      { href: "/dashboard/tax-codes", title: "Tax codes", Icon: Receipt, orgScoped: true },
    ],
  },
  {
    label: "Developers",
    items: [
      { href: "/dashboard/api-keys", title: "API keys", Icon: KeyRound, orgScoped: true },
      { href: "/dashboard/logs", title: "Logs", Icon: ScrollText, orgScoped: true },
      { href: "/dashboard/docs", title: "Docs", Icon: BookText, orgScoped: false },
    ],
  },
];

function isActivePath(pathname: string, item: NavItem) {
  if (item.exact) return pathname === item.href;
  return pathname === item.href || pathname.startsWith(`${item.href}/`);
}

export function DashboardSidebar({
  memberships,
  userEmail,
  environment,
}: {
  memberships: MembershipOption[];
  userEmail: string | null;
  environment: string;
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);

  const orgId = searchParams.get("orgId") || memberships[0]?.orgId || "";
  const activeOrg = memberships.find((m) => m.orgId === orgId) ?? memberships[0] ?? null;

  // Close the mobile drawer whenever the route changes.
  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  function hrefFor(item: NavItem) {
    return item.orgScoped && orgId ? `${item.href}?orgId=${orgId}` : item.href;
  }

  function switchOrg(nextOrgId: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("orgId", nextOrgId);
    router.push(`${pathname}?${params.toString()}`);
  }

  const isTest = environment.toLowerCase() === "test";

  const renderBody = (onClose?: () => void) => (
    <div className="flex h-full flex-col gap-1 bg-sidebar text-sidebar-foreground">
      {/* Brand + environment */}
      <div className="flex items-center justify-between gap-2 px-4 pt-4 pb-3">
        <Link href="/dashboard" className="flex items-center gap-2">
          <BrandWordmark text="Krafta•Pay" className="text-base" />
        </Link>
        <div className="flex items-center gap-1.5">
          <span
            className={cn(
              "rounded-full border px-2 py-0.5 text-[11px] font-medium",
              isTest
                ? "border-amber-500/40 bg-amber-500/10 text-amber-600 dark:text-amber-400"
                : "border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
            )}
          >
            {isTest ? "Test mode" : "Live"}
          </span>
          {onClose ? (
            <button
              type="button"
              onClick={onClose}
              aria-label="Close menu"
              className="inline-flex size-8 items-center justify-center rounded-md text-muted-foreground hover:bg-sidebar-accent"
            >
              <X className="size-4" aria-hidden />
            </button>
          ) : null}
        </div>
      </div>

      {/* Org switcher — a styled box with a real <select> overlaid on top, so it
          stays reliable + keyboard/mobile-native while keeping the two-line look. */}
      {activeOrg ? (
        <div className="px-3 pb-2">
          <div className="relative">
            <div className="pointer-events-none flex items-center justify-between gap-2 rounded-md border border-sidebar-border bg-sidebar px-2.5 py-2">
              <span className="min-w-0">
                <span className="block truncate text-sm font-medium">{activeOrg.orgName}</span>
                <span className="block truncate text-xs text-muted-foreground">{activeOrg.role}</span>
              </span>
              <ChevronsUpDown className="size-4 shrink-0 text-muted-foreground" aria-hidden />
            </div>
            <select
              aria-label="Switch organization"
              value={orgId}
              onChange={(e) => switchOrg(e.target.value)}
              // Invisible, full-size, captures the click; text-base avoids iOS zoom.
              className="absolute inset-0 size-full cursor-pointer text-base opacity-0"
            >
              {memberships.map((m) => (
                <option key={m.orgId} value={m.orgId}>
                  {m.orgName} ({m.role})
                </option>
              ))}
            </select>
          </div>
        </div>
      ) : null}

      {/* Nav */}
      <nav className="flex-1 space-y-5 overflow-y-auto px-3 py-2">
        {NAV_GROUPS.map((group, gi) => (
          <div key={group.label ?? `group-${gi}`} className="space-y-1">
            {group.label ? (
              <p className="px-2.5 pb-1 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                {group.label}
              </p>
            ) : null}
            {group.items.map((item) => {
              const active = isActivePath(pathname, item);
              const Icon = item.Icon;
              return (
                <Link
                  key={item.href}
                  href={hrefFor(item)}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm transition-colors",
                    active
                      ? "bg-sidebar-accent font-medium text-sidebar-accent-foreground"
                      : "text-muted-foreground hover:bg-sidebar-accent/60 hover:text-sidebar-foreground",
                  )}
                >
                  <Icon className="size-4 shrink-0" aria-hidden />
                  {item.title}
                </Link>
              );
            })}
          </div>
        ))}
      </nav>

      {/* Account + sign out */}
      <div className="border-t border-sidebar-border p-3">
        {userEmail ? (
          <p className="truncate px-1 pb-2 text-xs text-muted-foreground" title={userEmail}>
            {userEmail}
          </p>
        ) : null}
        <form action={signOutAction}>
          <Button type="submit" variant="outline" size="sm" className="w-full">
            Sign out
          </Button>
        </form>
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop: fixed left rail */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 border-r border-sidebar-border md:block">
        {renderBody()}
      </aside>

      {/* Mobile: sticky top bar */}
      <div className="sticky top-0 z-30 flex items-center justify-between border-b bg-sidebar px-4 py-3 md:hidden">
        <Link href="/dashboard">
          <BrandWordmark text="Krafta•Pay" className="text-base" />
        </Link>
        <button
          type="button"
          onClick={() => setMobileOpen(true)}
          aria-label="Open menu"
          className="inline-flex size-9 items-center justify-center rounded-md border"
        >
          <Menu className="size-5" aria-hidden />
        </button>
      </div>

      {/* Mobile: drawer */}
      {mobileOpen ? (
        <div className="fixed inset-0 z-50 md:hidden">
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => setMobileOpen(false)}
            aria-hidden
          />
          <div className="absolute inset-y-0 left-0 w-72 max-w-[85%] border-r border-sidebar-border shadow-xl">
            {renderBody(() => setMobileOpen(false))}
          </div>
        </div>
      ) : null}
    </>
  );
}
