"use client";

import Link from "next/link";
import { BadgeCheck, Bell, CreditCard, LogOut, Sparkles } from "lucide-react";

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
import { useT } from "@/lib/locales/dashboard/context";

export function DashboardUserMenu({
  user,
  orgSlug,
  catalogSlug,
  showUpgradeCta = true,
}: {
  user: { name: string; email: string; avatar?: string };
  orgSlug: string;
  catalogSlug: string;
  showUpgradeCta?: boolean;
}) {
  const t = useT();
  const initials = user.name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className="inline-flex items-center justify-center rounded-md p-2 outline-none ring-ring transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:ring-2 active:bg-accent data-[state=open]:bg-accent">
          <Avatar className="h-8 w-8 rounded-full">
            <AvatarImage src={user.avatar} alt={user.name} />
            <AvatarFallback className="rounded-lg">{initials}</AvatarFallback>
          </Avatar>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-48 rounded-lg">
        <DropdownMenuLabel className="p-0 font-normal">
          <div className="flex items-center gap-2 px-2 py-2 text-left text-sm">
            <Avatar className="h-8 w-8 rounded-full">
              <AvatarImage src={user.avatar} alt={user.name} />
              <AvatarFallback className="rounded-lg">{initials}</AvatarFallback>
            </Avatar>
            <div className="grid flex-1 text-left text-sm leading-tight">
              <span className="truncate font-medium">{user.name}</span>
              <span className="truncate text-xs text-muted-foreground">
                {user.email}
              </span>
            </div>
          </div>
        </DropdownMenuLabel>
        {showUpgradeCta ? (
          <>
            <DropdownMenuGroup>
              <DropdownMenuItem asChild>
                <Link href={`/dashboard/${orgSlug}/${catalogSlug}/billing`}>
                  <Sparkles className="size-4" />
                  {t("nav.user.upgrade")}
                </Link>
              </DropdownMenuItem>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
          </>
        ) : null}
        <DropdownMenuGroup>
          <DropdownMenuItem>
            <BadgeCheck className="size-4" />
            {t("nav.user.account")}
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <Link href={`/dashboard/${orgSlug}/${catalogSlug}/billing`}>
              <CreditCard className="size-4" />
              {t("nav.user.billing")}
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem>
            <Bell className="size-4" />
            {t("nav.user.notifications")}
          </DropdownMenuItem>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => signOut()}>
          <LogOut className="size-4" />
          {t("nav.user.logout")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
