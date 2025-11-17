"use client";

import { usePathname } from "next/navigation";
import { NavigationMenu } from "@/components/ui/navigation-menu";
import { DashboardNavLink } from "@/components/dashboard/dashboard-nav-link";
import Link from "next/link";

// Dashboard navigation links
const DASHBOARD_LINKS = [
  { href: "/dashboard", label: "Overview" },
  { href: "/dashboard/categories", label: "Categories" },
  { href: "/dashboard/items", label: "Items" },
  { href: "/dashboard/settings", label: "Settings" },
];

export function DashboardNavbar() {
  const pathname = usePathname();

  return (
    <div className="flex flex-col">
      {/* Logo block */}
      <header className="px-6 py-3 h-16">
        <nav className="h-full flex items-center">
            <h1 className="h-full flex items-center text-2xl font-semibold">
                Krafta
            </h1>
        </nav>
      </header>

      {/* Navigation block */}
      <nav className="relative px-4 mt-[-10px]">
  {/* Fake bottom border */}
  <div className="pointer-events-none absolute bottom-0 left-0 right-0 h-px bg-neutral-800" />

  <NavigationMenu>
    {DASHBOARD_LINKS.map((link) => (
      <DashboardNavLink
        key={link.href}
        asChild
        isActive={pathname === link.href}
      >
        <Link href={link.href}>{link.label}</Link>
      </DashboardNavLink>
    ))}
  </NavigationMenu>
</nav>
    </div>
  );
}
