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

export type CatalogOption = {
  id: string;
  name: string;
  slug: string;
  logo?: string | null;
};

type CatalogSwitcherProps = {
  orgSlug: string;
  currentCatalogSlug: string;
  catalogs: CatalogOption[];
};

export function CatalogSwitcher({
  orgSlug,
  currentCatalogSlug,
  catalogs,
}: CatalogSwitcherProps) {
  const router = useRouter();
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
          <span className="text-xs text-muted-foreground">No catalogs</span>
        </div>
        <ChevronsUpDown className="ml-auto size-4 text-muted-foreground" />
      </div>
    );
  }

  const activeCatalog = selectedCatalog ?? catalogs[0];
  const catalogInitial = (activeCatalog?.name || "C").slice(0, 1).toUpperCase();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          className="flex items-center gap-2 overflow-hidden rounded-md p-2 text-left text-sm outline-none ring-ring transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:ring-2 active:bg-accent active:text-accent-foreground data-[state=open]:bg-accent data-[state=open]:text-accent-foreground"
          aria-label="Select catalog"
        >
          {activeCatalog?.logo ? (
            <Image
              src={activeCatalog.logo}
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
          <div className="grid flex-1 text-left text-sm leading-tight">
            <span className="truncate font-medium">{activeCatalog?.name}</span>
            <span className="truncate text-xs text-muted-foreground">Catalogs</span>
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
            placeholder="Search catalog..."
            className="h-8"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        <DropdownMenuLabel className="text-xs text-muted-foreground">
          Catalogs
        </DropdownMenuLabel>
        {filteredCatalogs.map((catalog, index) => (
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
            {catalog.logo ? (
              <Image
                src={catalog.logo}
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
            {catalog.name}
            <DropdownMenuShortcut>⌘{index + 1}</DropdownMenuShortcut>
          </DropdownMenuItem>
        ))}
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
          <span className="font-medium text-muted-foreground">Add catalog</span>
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
