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
import { createClient } from "@/lib/supabase/client";

type Catalog = {
  id: string;
  name: string;
  slug: string;
};

export function CatalogSwitcher() {
  const [open, setOpen] = React.useState(false);
  const [catalogs, setCatalogs] = React.useState<Catalog[]>([]);
  const [selectedSlug, setSelectedSlug] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  const supabase = React.useMemo(() => createClient(), []);

  React.useEffect(() => {
  async function loadCatalogs() {
    setLoading(true);
    setError(null);

    const { data, error } = await supabase
      .from("catalogs")
      .select("id, name, slug")
      .order("created_at", { ascending: true });

    if (error) {
      setError(error.message);
      setCatalogs([]);
    } else {
      setCatalogs(data ?? []);
      if (data && data.length > 0) {
        // only set default once, if not already chosen
        setSelectedSlug((current) => current ?? data[0].slug);
      }
    }

    setLoading(false);
  }

  loadCatalogs();
}, [supabase]);

  const selectedCatalog = catalogs.find((c) => c.slug === selectedSlug);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-[220px] justify-between"
        >
          {loading
            ? "Loading catalogs..."
            : selectedCatalog
              ? selectedCatalog.name
              : "Select catalog"}
          <ChevronsUpDown className="ml-2 h-4 w-4 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[220px] p-0">
        <Command>
          <CommandInput placeholder="Search catalog..." className="h-9" />
          <CommandList>
            {error && (
              <CommandEmpty>Error loading catalogs</CommandEmpty>
            )}
            {!error && !loading && catalogs.length === 0 && (
              <CommandEmpty>No catalogs found.</CommandEmpty>
            )}
            <CommandGroup>
              {catalogs.map((catalog) => (
                <CommandItem
                  key={catalog.id}
                  value={catalog.slug}
                  onSelect={(currentValue) => {
                    setSelectedSlug(
                      currentValue === selectedSlug ? null : currentValue,
                    );
                    setOpen(false);
                    // later: navigate or lift this selection up via props/context
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
