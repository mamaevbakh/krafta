"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
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
  Webhook,
  X,
  type LucideIcon,
} from "lucide-react";
import type { MembershipOption } from "@/lib/org-memberships";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { BrandWordmark } from "@/components/brand/brand-wordmark";
import { signOutAction } from "@/app/actions/auth";
import { useT } from "@/lib/locales/context";
import type { PayMessageKey } from "@/lib/locales/messages";
import type { PayLocale } from "@/lib/locales/locale";
import { LanguageSwitcher } from "@/components/dashboard/language-switcher.client";
import { EnvironmentSwitcher } from "@/components/dashboard/environment-switcher.client";

type NavItem = {
  href: string;
  titleKey: PayMessageKey;
  Icon: LucideIcon;
  orgScoped: boolean;
  exact?: boolean;
};

type NavGroup = { labelKey: PayMessageKey | null; items: NavItem[] };

const NAV_GROUPS: NavGroup[] = [
  {
    labelKey: null,
    items: [{ href: "", titleKey: "nav.overview", Icon: Home, orgScoped: true, exact: true }],
  },
  {
    labelKey: "nav.group.payments",
    items: [
      { href: "/providers", titleKey: "nav.providers", Icon: CreditCard, orgScoped: true },
      { href: "/plans", titleKey: "nav.plans", Icon: Layers, orgScoped: true },
      { href: "/subscriptions", titleKey: "nav.subscriptions", Icon: Repeat, orgScoped: true },
      { href: "/tax-codes", titleKey: "nav.taxCodes", Icon: Receipt, orgScoped: true },
    ],
  },
  {
    labelKey: "nav.group.developers",
    items: [
      { href: "/api-keys", titleKey: "nav.apiKeys", Icon: KeyRound, orgScoped: true },
      { href: "/webhooks", titleKey: "nav.webhooks", Icon: Webhook, orgScoped: true },
      { href: "/logs", titleKey: "nav.logs", Icon: ScrollText, orgScoped: true },
      { href: "/dashboard/docs", titleKey: "nav.docs", Icon: BookText, orgScoped: false },
    ],
  },
];

/**
 * The org now lives in the path (`/dashboard/org/[slug]/plans`), so a nav item
 * stores only its suffix and the slug is spliced in at render. That is what
 * removed the organization dropdown from six separate pages: there is nothing
 * left to pick, because the URL already says which org you are looking at.
 */
function hrefForItem(item: NavItem, orgSlug: string | null) {
  if (!item.orgScoped) return item.href;
  if (!orgSlug) return "/dashboard";
  return `/dashboard/org/${orgSlug}${item.href}`;
}

function isActivePath(pathname: string, item: NavItem, orgSlug: string | null) {
  const href = hrefForItem(item, orgSlug);
  if (item.exact) return pathname === href;
  return pathname === href || pathname.startsWith(`${href}/`);
}

/** Read the org slug straight out of /dashboard/org/[slug]/… */
function orgSlugFromPath(pathname: string): string | null {
  const match = pathname.match(/^\/dashboard\/org\/([^/]+)/);
  return match ? decodeURIComponent(match[1]) : null;
}

export function DashboardSidebar({
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
  const [mobileOpen, setMobileOpen] = useState(false);

  const orgSlug = orgSlugFromPath(pathname) ?? memberships[0]?.orgSlug ?? null;
  const activeOrg = memberships.find((m) => m.orgSlug === orgSlug) ?? memberships[0] ?? null;
  // A merchant with one organization has nothing to switch between, so the
  // picker is not rendered at all. This is the common case by design: account
  // creation makes exactly one org.
  const showOrgSwitcher = memberships.length > 1;

  // Close the mobile drawer whenever the route changes.
  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  function hrefFor(item: NavItem) {
    return hrefForItem(item, orgSlug);
  }

  /**
   * Switching orgs keeps you on the same screen, just under the other org's
   * slug — swapping the segment rather than bouncing to the overview, so
   * "compare plans across my two businesses" is one click, not three.
   */
  function switchOrg(nextOrgSlug: string) {
    if (!orgSlug) {
      router.push(`/dashboard/org/${nextOrgSlug}`);
      return;
    }
    router.push(
      pathname.replace(
        `/dashboard/org/${encodeURIComponent(orgSlug)}`,
        `/dashboard/org/${encodeURIComponent(nextOrgSlug)}`,
      ),
    );
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
          <EnvironmentSwitcher environment={isTest ? "test" : "live"} />
          {onClose ? (
            <button
              type="button"
              onClick={onClose}
              aria-label={t("nav.closeMenu")}
              className="inline-flex size-8 items-center justify-center rounded-md text-muted-foreground hover:bg-sidebar-accent"
            >
              <X className="size-4" aria-hidden />
            </button>
          ) : null}
        </div>
      </div>

      {/* Org switcher — a styled box with a real <select> overlaid on top, so it
          stays reliable + keyboard/mobile-native while keeping the two-line look. */}
      {activeOrg && showOrgSwitcher ? (
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
              aria-label={t("nav.switchOrg")}
              value={orgSlug ?? ""}
              onChange={(e) => switchOrg(e.target.value)}
              // Invisible, full-size, captures the click; text-base avoids iOS zoom.
              className="absolute inset-0 size-full cursor-pointer text-base opacity-0"
            >
              {memberships.map((m) => (
                <option key={m.orgId} value={m.orgSlug}>
                  {m.orgName} ({m.role})
                </option>
              ))}
            </select>
          </div>
        </div>
      ) : null}

      {activeOrg && !showOrgSwitcher ? (
        <div className="px-4 pb-3">
          <p className="truncate text-sm font-medium" title={activeOrg.orgName}>
            {activeOrg.orgName}
          </p>
        </div>
      ) : null}

      {/* Nav */}
      <nav className="flex-1 space-y-5 overflow-y-auto px-3 py-2">
        {NAV_GROUPS.map((group, gi) => (
          <div key={group.labelKey ?? `group-${gi}`} className="space-y-1">
            {group.labelKey ? (
              <p className="px-2.5 pb-1 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                {t(group.labelKey)}
              </p>
            ) : null}
            {group.items.map((item) => {
              const active = isActivePath(pathname, item, orgSlug);
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
                  {t(item.titleKey)}
                </Link>
              );
            })}
          </div>
        ))}
      </nav>

      {/* Account + sign out */}
      <div className="border-t border-sidebar-border p-3">
        <LanguageSwitcher locale={locale} />
        {userEmail ? (
          <p className="truncate px-1 pb-2 text-xs text-muted-foreground" title={userEmail}>
            {userEmail}
          </p>
        ) : null}
        <form action={signOutAction}>
          <Button type="submit" variant="outline" size="sm" className="w-full">
            {t("nav.signOut")}
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
          aria-label={t("nav.openMenu")}
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
