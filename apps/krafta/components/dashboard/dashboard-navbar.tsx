"use client";

import { useMemo } from "react";
import { usePathname } from "next/navigation";
import { NavigationMenu } from "@/components/ui/navigation-menu";
import { DashboardNavLink } from "@/components/dashboard/dashboard-nav-link";
import Link from "next/link";
import { CatalogSwitcher } from "./catalog-switcher";
import type { CatalogSummary } from "@/lib/dashboard/catalogs";
import { LayoutGroup } from "framer-motion";
import { BrandWordmark } from "@/components/brand/brand-wordmark";
import {
  BadgeCheck,
  Bell,
  ChevronsUpDown,
  CreditCard,
  LogOut,
  Sparkles,
} from "lucide-react";
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { signOut } from "@/lib/auth/actions";

const DASHBOARD_LINKS = [
  { segment: "", label: "Overview" },
  { segment: "categories", label: "Categories" },
  { segment: "items", label: "Items" },
  { segment: "builder", label: "Builder" },
  { segment: "settings", label: "Settings" },
] as const;

export function DashboardNavbar({
  orgSlug,
  catalogSlug,
  catalogs,
  user,
}: {
  orgSlug: string;
  catalogSlug: string;
  catalogs: CatalogSummary[];
  user: {
    name: string;
    email: string;
    avatar?: string;
  };
}) {
  const pathname = usePathname();
  const basePath = useMemo(
    () => `/dashboard/${orgSlug}/${catalogSlug}`,
    [orgSlug, catalogSlug],
  );

  const initials = user.name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  return (
    <div className="flex flex-col">
      {/* Logo block */}
      <header className="px-6 py-3 h-16">
        <nav className="h-full flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <h1 className="h-full flex items-center text-2xl">
              <BrandWordmark className="text-2xl" />
            </h1>

            {/* User profile dropdown */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="flex w-full items-center gap-2 overflow-hidden rounded-md p-2 text-left text-sm outline-none ring-ring transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:ring-2 active:bg-accent active:text-accent-foreground data-[state=open]:bg-accent data-[state=open]:text-accent-foreground">
                  <Avatar className="h-8 w-8 rounded-lg">
                    <AvatarImage src={user.avatar} alt={user.name} />
                    <AvatarFallback className="rounded-lg">{initials}</AvatarFallback>
                  </Avatar>
                  <div className="grid flex-1 text-left text-sm leading-tight">
                    <span className="truncate font-medium">{user.name}</span>
                    <span className="truncate text-xs text-muted-foreground">{user.email}</span>
                  </div>
                  <ChevronsUpDown className="ml-auto size-4 text-muted-foreground" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-[--radix-dropdown-menu-trigger-width] min-w-56 rounded-lg">
                <DropdownMenuLabel className="p-0 font-normal">
                  <div className="flex items-center gap-2 px-1 py-1.5 text-left text-sm">
                    <Avatar className="h-8 w-8 rounded-lg">
                      <AvatarImage src={user.avatar} alt={user.name} />
                      <AvatarFallback className="rounded-lg">{initials}</AvatarFallback>
                    </Avatar>
                    <div className="grid flex-1 text-left text-sm leading-tight">
                      <span className="truncate font-medium">{user.name}</span>
                      <span className="truncate text-xs text-muted-foreground">{user.email}</span>
                    </div>
                  </div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuGroup>
                  <DropdownMenuItem>
                    <Sparkles className="size-4" />
                    Upgrade to Pro
                  </DropdownMenuItem>
                </DropdownMenuGroup>
                <DropdownMenuSeparator />
                <DropdownMenuGroup>
                  <DropdownMenuItem>
                    <BadgeCheck className="size-4" />
                    Account
                  </DropdownMenuItem>
                  <DropdownMenuItem>
                    <CreditCard className="size-4" />
                    Billing
                  </DropdownMenuItem>
                  <DropdownMenuItem>
                    <Bell className="size-4" />
                    Notifications
                  </DropdownMenuItem>
                </DropdownMenuGroup>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => signOut()}>
                  <LogOut className="size-4" />
                  Log out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            <CatalogSwitcher
              orgSlug={orgSlug}
              currentCatalogSlug={catalogSlug}
              catalogs={catalogs}
            />
          </div>
        </nav>
      </header>

      {/* Navigation block */}
      <nav className="relative px-4 -mt-2.5">
  {/* Fake bottom border */}
  <div className="pointer-events-none absolute bottom-0 left-0 right-0 h-px bg-border" />

  <LayoutGroup id="dashboard-nav">
    <NavigationMenu>
    {DASHBOARD_LINKS.map(({ segment, label }) => {
      const href = segment ? `${basePath}/${segment}` : basePath;
      const isActive = segment
        ? pathname.startsWith(href)
        : pathname === href;

      return (
      <DashboardNavLink
        key={href}
        asChild
        isActive={isActive}
      >
        <Link href={href}>{label}</Link>
      </DashboardNavLink>
      );
    })}
    </NavigationMenu>
  </LayoutGroup>
</nav>
    </div>
  );
}
