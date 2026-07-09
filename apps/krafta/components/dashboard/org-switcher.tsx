"use client";

import * as React from "react";
import Image from "next/image";
import { ChevronsUpDown } from "lucide-react";
import { useRouter } from "next/navigation";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { getOrgAssetUrl } from "@/lib/orgs/media";
import { useT } from "@/lib/locales/dashboard/context";

export type OrgOption = {
  id: string;
  name: string;
  slug: string;
  logo_path?: string | null;
};

type OrgSwitcherProps = {
  currentOrgSlug: string;
  orgs: OrgOption[];
  triggerClassName?: string;
};

export function OrgSwitcher({
  currentOrgSlug,
  orgs,
  triggerClassName,
}: OrgSwitcherProps) {
  const router = useRouter();
  const t = useT();
  const [searchQuery, setSearchQuery] = React.useState("");
  const [selectedSlug, setSelectedSlug] = React.useState(currentOrgSlug);

  React.useEffect(() => {
    setSelectedSlug(currentOrgSlug);
  }, [currentOrgSlug]);

  const selectedOrg = React.useMemo(
    () => orgs.find((org) => org.slug === selectedSlug),
    [orgs, selectedSlug],
  );

  const filteredOrgs = React.useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return orgs;
    return orgs.filter((org) => org.name.toLowerCase().includes(q));
  }, [orgs, searchQuery]);

  if (orgs.length === 0) {
    return (
      <div className="flex items-center gap-2 rounded-md border border-border bg-background px-2 py-2">
        <div className="flex size-8 items-center justify-center rounded-lg bg-muted">
          <div className="h-4 w-4 rounded bg-muted-foreground/30" />
        </div>
        <div className="grid flex-1 gap-1">
          <span className="text-xs text-muted-foreground">{t("nav.org.none")}</span>
        </div>
        <ChevronsUpDown className="ml-auto size-4 text-muted-foreground" />
      </div>
    );
  }

  const activeOrg = selectedOrg ?? orgs[0];
  const orgInitial = (activeOrg?.name || "O").slice(0, 1).toUpperCase();
  const activeOrgLogo = getOrgAssetUrl(activeOrg?.logo_path);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          className={cn(
            "flex w-full min-w-0 items-center gap-2 overflow-hidden rounded-md p-2 text-left text-sm outline-none ring-ring transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:ring-2 active:bg-accent active:text-accent-foreground data-[state=open]:bg-accent data-[state=open]:text-accent-foreground md:w-auto",
            triggerClassName,
          )}
          aria-label={t("nav.org.select_aria")}
        >
          {activeOrgLogo ? (
            <Image
              src={activeOrgLogo}
              alt={activeOrg.name}
              width={32}
              height={32}
              className="size-8 rounded-lg object-cover"
            />
          ) : (
            <div className="flex size-8 items-center justify-center rounded-lg border bg-muted">
              <span className="text-xs font-semibold">{orgInitial}</span>
            </div>
          )}
          <span className="min-w-0 flex-1 truncate font-medium">
            {activeOrg?.name}
          </span>
          <ChevronsUpDown className="ml-auto size-4" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        className="w-[--radix-dropdown-menu-trigger-width] min-w-56 rounded-lg"
        align="start"
        sideOffset={4}
      >
        <div className="p-2">
          <Input
            placeholder={t("nav.org.search")}
            className="h-8"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        <DropdownMenuLabel className="text-xs text-muted-foreground">
          {t("nav.org.label")}
        </DropdownMenuLabel>
        {filteredOrgs.map((org, index) => {
          const orgLogo = getOrgAssetUrl(org.logo_path);
          return (
            <DropdownMenuItem
              key={org.id}
              className="gap-2 p-2"
              onClick={() => {
                setSelectedSlug(org.slug);
                if (org.slug !== selectedSlug) {
                  router.push(`/dashboard/${org.slug}`);
                }
              }}
            >
              {orgLogo ? (
                <Image
                  src={orgLogo}
                  alt={org.name}
                  width={24}
                  height={24}
                  className="size-6 shrink-0 rounded-md object-cover"
                />
              ) : (
                <div className="flex size-6 items-center justify-center rounded-md border">
                  <span className="text-[10px] font-semibold">
                    {org.name.slice(0, 1).toUpperCase()}
                  </span>
                </div>
              )}
              <span className="flex-1 truncate">{org.name}</span>
              <span className="text-xs text-muted-foreground">⌘{index + 1}</span>
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function OrgSwitcherSkeleton() {
  return (
    <div className="flex items-center gap-2 rounded-md p-2">
      <Skeleton className="size-8 rounded-lg" />
      <div className="grid flex-1 gap-1">
        <Skeleton className="h-4 w-28" />
      </div>
      <Skeleton className="h-4 w-4" />
    </div>
  );
}

