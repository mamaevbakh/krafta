"use client";

import * as React from "react";
import { ChevronsUpDown, Plus } from "lucide-react";
import Image from "next/image";

import { useRouter } from "next/navigation";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { getCatalogAssetUrl } from "@/lib/catalogs/media";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/locales/dashboard/context";

export type CatalogOption = {
  id: string;
  name: string;
  slug: string;
  logo_path?: string | null;
};

type CatalogSwitcherProps = {
  orgSlug: string;
  currentCatalogSlug: string;
  catalogs: CatalogOption[];
  triggerClassName?: string;
};

export function CatalogSwitcher({
  orgSlug,
  currentCatalogSlug,
  catalogs,
  triggerClassName,
}: CatalogSwitcherProps) {
  const router = useRouter();
  const t = useT();
  const [searchQuery, setSearchQuery] = React.useState("");

  const [selectedSlug, setSelectedSlug] = React.useState(currentCatalogSlug);

  React.useEffect(() => {
    setSelectedSlug(currentCatalogSlug);
  }, [currentCatalogSlug]);

  const hasCatalogs = catalogs.length > 0;
  const selectedCatalog = React.useMemo(
    () => catalogs.find((c) => c.slug === selectedSlug),
    [catalogs, selectedSlug],
  );

  const filteredCatalogs = React.useMemo(
    () =>
      catalogs.filter((c) =>
        c.name.toLowerCase().includes(searchQuery.toLowerCase())
      ),
    [catalogs, searchQuery]
  );

  if (!hasCatalogs) {
    return (
      <div className="flex items-center gap-2 rounded-md border border-border bg-background px-2 py-2">
        <div className="flex size-8 items-center justify-center rounded-lg bg-muted">
          <div className="h-4 w-4 rounded bg-muted-foreground/30" />
        </div>
        <div className="grid flex-1 gap-1">
          <span className="text-xs text-muted-foreground">{t("nav.catalog.none")}</span>
        </div>
        <ChevronsUpDown className="ml-auto size-4 text-muted-foreground" />
      </div>
    );
  }

  const activeCatalog = selectedCatalog ?? catalogs[0];
  const catalogInitial = (activeCatalog?.name || "C").slice(0, 1).toUpperCase();
  const activeCatalogLogo = getCatalogAssetUrl(activeCatalog?.logo_path);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          className={cn(
            "flex w-full min-w-0 items-center gap-2 overflow-hidden rounded-md p-2 text-left text-sm outline-none ring-ring transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:ring-2 active:bg-accent active:text-accent-foreground data-[state=open]:bg-accent data-[state=open]:text-accent-foreground md:w-auto",
            triggerClassName
          )}
          aria-label={t("nav.catalog.select_aria")}
        >
          {activeCatalogLogo ? (
            <Image
              src={activeCatalogLogo}
              alt={activeCatalog.name}
              width={32}
              height={32}
              className="size-8 rounded-lg object-cover"
            />
          ) : (
            <div className="flex size-8 items-center justify-center rounded-lg border bg-muted">
              <span className="text-xs font-semibold">{catalogInitial}</span>
            </div>
          )}
          <div className="grid min-w-0 flex-1 text-left text-sm leading-tight">
            <span className="truncate font-medium">{activeCatalog?.name}</span>
            <span className="truncate text-xs text-muted-foreground">{t("nav.catalog.label")}</span>
          </div>
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
            placeholder={t("nav.catalog.search")}
            className="h-8"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        <DropdownMenuLabel className="text-xs text-muted-foreground">
          {t("nav.catalog.label")}
        </DropdownMenuLabel>
        {filteredCatalogs.map((catalog, index) => {
          const catalogLogo = getCatalogAssetUrl(catalog.logo_path);

          return (
            <DropdownMenuItem
              key={catalog.id}
              className="gap-2 p-2"
              onClick={() => {
                setSelectedSlug(catalog.slug);
                if (catalog.slug !== selectedSlug) {
                  router.push(`/dashboard/${orgSlug}/${catalog.slug}`);
                }
              }}
            >
              {catalogLogo ? (
                <Image
                  src={catalogLogo}
                  alt={catalog.name}
                  width={24}
                  height={24}
                  className="size-6 shrink-0 rounded-md object-cover"
                />
              ) : (
                <div className="flex size-6 items-center justify-center rounded-md border">
                  <span className="text-[10px] font-semibold">
                    {catalog.name.slice(0, 1).toUpperCase()}
                  </span>
                </div>
              )}
              <span className="flex-1 truncate">{catalog.name}</span>
              <DropdownMenuShortcut>⌘{index + 1}</DropdownMenuShortcut>
            </DropdownMenuItem>
          );
        })}
        <DropdownMenuSeparator />
        <DropdownMenuItem
          className="gap-2 p-2"
          onClick={() => {
            router.push(`/dashboard/${orgSlug}/new`);
          }}
        >
          <div className="flex size-6 items-center justify-center rounded-md border bg-transparent">
            <Plus className="size-4" />
          </div>
          <span className="font-medium text-muted-foreground">{t("nav.catalog.add")}</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function CatalogSwitcherSkeleton() {
  return (
    <div className="flex items-center gap-2 rounded-md p-2">
      <Skeleton className="size-8 rounded-lg" />
      <div className="grid flex-1 gap-1">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-3 w-16" />
      </div>
      <Skeleton className="h-4 w-4" />
    </div>
  );
}
