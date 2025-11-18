"use client";

import * as React from "react";
import { Check, ChevronsUpDown } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useRouter } from "next/navigation";

export type CatalogOption = {
  id: string;
  name: string;
  slug: string;
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
  const [open, setOpen] = React.useState(false);
  const [selectedSlug, setSelectedSlug] = React.useState(currentCatalogSlug);
  const router = useRouter();

  React.useEffect(() => {
    setSelectedSlug(currentCatalogSlug);
  }, [currentCatalogSlug]);

  const hasCatalogs = catalogs.length > 0;
  const selectedCatalog = React.useMemo(
    () => catalogs.find((c) => c.slug === selectedSlug),
    [catalogs, selectedSlug],
  );
  const buttonLabel = React.useMemo(() => {
    if (!hasCatalogs) return "No catalogs";
    if (selectedCatalog) return selectedCatalog.name;
    if (selectedSlug) return selectedSlug;
    return "Select catalog";
  }, [hasCatalogs, selectedCatalog, selectedSlug]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-[220px] justify-between"
          disabled={!hasCatalogs}
        >
          {buttonLabel}
          <ChevronsUpDown className="ml-2 h-4 w-4 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[220px] p-0">
        <Command>
          <CommandInput placeholder="Search catalog..." className="h-9" />
          <CommandList>
            {!hasCatalogs && <CommandEmpty>No catalogs found.</CommandEmpty>}
            <CommandGroup>
              {catalogs.map((catalog) => (
                <CommandItem
                  key={catalog.id}
                  value={catalog.slug}
                  onSelect={(currentValue) => {
                    setSelectedSlug(currentValue);
                    setOpen(false);
                    if (currentValue !== selectedSlug) {
                      router.push(`/dashboard/${orgSlug}/${currentValue}`);
                    }
                  }}
                >
                  {catalog.name}
                  <Check
                    className={cn(
                      "ml-auto h-4 w-4",
                      selectedSlug === catalog.slug
                        ? "opacity-100"
                        : "opacity-0",
                    )}
                  />
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
