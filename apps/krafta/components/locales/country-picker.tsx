"use client";

import * as React from "react";
import { Check, ChevronsUpDown } from "lucide-react";

import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { COUNTRY_CODES, getCountryName } from "@/lib/locale/countries";
import { RECOMMENDED_COUNTRY_CODES } from "@/lib/locale/country-defaults";

/**
 * Grouped country picker — the geography twin of CurrencyPicker, built on the
 * same Command primitives so it gets the Recommended + All pattern with fuzzy
 * search. Recommended = Krafta's home market (UZ) + regional/common countries;
 * All = every ISO 3166-1 region, alphabetical by display name. Search matches
 * the name (e.g. "uzbek") or the code (e.g. "UZ"). Picking a country drives the
 * currency default upstream (see the onboarding wizard).
 */

const RECOMMENDED = new Set<string>(RECOMMENDED_COUNTRY_CODES);

// ISO 3166-1 alpha-2 → flag emoji via regional indicator symbols. Returns "" for
// anything that isn't two ASCII letters (renders no glyph rather than tofu).
function flagEmoji(code: string): string {
  if (!/^[A-Za-z]{2}$/.test(code)) return "";
  const base = 0x1f1e6;
  const cc = code.toUpperCase();
  return String.fromCodePoint(
    base + (cc.charCodeAt(0) - 65),
    base + (cc.charCodeAt(1) - 65),
  );
}

type CountryOption = { code: string; name: string };

export type CountryPickerProps = {
  value: string;
  onChange: (code: string) => void;
  disabled?: boolean;
  id?: string;
};

export function CountryPicker({
  value,
  onChange,
  disabled = false,
  id,
}: CountryPickerProps) {
  const [open, setOpen] = React.useState(false);

  const { recommended, other } = React.useMemo(() => {
    const rec: CountryOption[] = RECOMMENDED_COUNTRY_CODES.map((code) => ({
      code,
      name: getCountryName(code),
    }));
    const rest: CountryOption[] = COUNTRY_CODES.filter(
      (code) => !RECOMMENDED.has(code),
    )
      .map((code) => ({ code, name: getCountryName(code) }))
      .sort((a, b) => a.name.localeCompare(b.name));
    return { recommended: rec, other: rest };
  }, []);

  const selectedName = value ? getCountryName(value) : "";

  return (
    <Popover open={open} onOpenChange={setOpen} modal>
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className={cn(
            "w-full justify-between font-normal",
            !value && "text-muted-foreground",
          )}
        >
          {value ? (
            <span className="flex min-w-0 items-center gap-2">
              <span className="shrink-0 text-base leading-none">
                {flagEmoji(value)}
              </span>
              <span className="truncate">{selectedName}</span>
              <span className="shrink-0 text-xs text-muted-foreground">
                {value}
              </span>
            </span>
          ) : (
            <span className="truncate">Select a country</span>
          )}
          <ChevronsUpDown className="ml-2 size-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        side="bottom"
        align="start"
        sideOffset={4}
        collisionPadding={8}
        className="w-[var(--radix-popover-trigger-width)] p-0"
      >
        <Command>
          <CommandInput placeholder="Search countries..." />
          <CommandList className="max-h-[min(250px,var(--radix-popper-available-height))]">
            <CommandEmpty>No country found.</CommandEmpty>

            <CommandGroup heading="Recommended">
              {recommended.map((c) => (
                <CountryItem
                  key={c.code}
                  option={c}
                  isSelected={c.code === value}
                  onSelect={() => {
                    onChange(c.code);
                    setOpen(false);
                  }}
                />
              ))}
            </CommandGroup>

            <CommandSeparator />

            <CommandGroup heading="All countries">
              {other.map((c) => (
                <CountryItem
                  key={c.code}
                  option={c}
                  isSelected={c.code === value}
                  onSelect={() => {
                    onChange(c.code);
                    setOpen(false);
                  }}
                />
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

function CountryItem({
  option,
  isSelected,
  onSelect,
}: {
  option: CountryOption;
  isSelected: boolean;
  onSelect: () => void;
}) {
  // cmdk searches the `value` prop — pack name + code so "uzbek" and "UZ" both hit.
  return (
    <CommandItem value={`${option.name} ${option.code}`} onSelect={onSelect}>
      <Check
        className={cn("size-4 shrink-0", isSelected ? "opacity-100" : "opacity-0")}
      />
      <span className="shrink-0 text-base leading-none">
        {flagEmoji(option.code)}
      </span>
      <span className="flex-1 truncate">{option.name}</span>
      <span className="ml-2 shrink-0 text-xs text-muted-foreground">
        {option.code}
      </span>
    </CommandItem>
  );
}
