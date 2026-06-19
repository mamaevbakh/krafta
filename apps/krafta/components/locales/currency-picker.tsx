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
import { CURRENCY_CODES, getCurrencyName } from "@/lib/locale/currencies";
import { RECOMMENDED_CURRENCY_CODES } from "@/lib/locale/currency-defaults";

/**
 * Grouped currency picker — the money-side twin of LocalePicker, built on the
 * same Command primitives so it gets the Recommended + All pattern with fuzzy
 * search. Recommended = Krafta's home market (UZS) + regional/common
 * currencies; All = every active ISO-4217 code, alphabetical by display name.
 * Search matches the name (e.g. "euro") or the code (e.g. "EUR").
 */

const RECOMMENDED = new Set<string>(RECOMMENDED_CURRENCY_CODES);

type CurrencyOption = { code: string; name: string };

export type CurrencyPickerProps = {
  value: string;
  onChange: (code: string) => void;
  disabled?: boolean;
  id?: string;
};

export function CurrencyPicker({
  value,
  onChange,
  disabled = false,
  id,
}: CurrencyPickerProps) {
  const [open, setOpen] = React.useState(false);

  const { recommended, other } = React.useMemo(() => {
    const rec: CurrencyOption[] = RECOMMENDED_CURRENCY_CODES.map((code) => ({
      code,
      name: getCurrencyName(code),
    }));
    const rest: CurrencyOption[] = CURRENCY_CODES.filter(
      (code) => !RECOMMENDED.has(code),
    )
      .map((code) => ({ code, name: getCurrencyName(code) }))
      .sort((a, b) => a.name.localeCompare(b.name));
    return { recommended: rec, other: rest };
  }, []);

  const selectedName = value ? getCurrencyName(value) : "";

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
            <span className="flex min-w-0 items-baseline gap-2">
              <span className="truncate">{selectedName}</span>
              <span className="shrink-0 text-xs text-muted-foreground">
                {value}
              </span>
            </span>
          ) : (
            <span className="truncate">Select a currency</span>
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
          <CommandInput placeholder="Search currencies..." />
          <CommandList className="max-h-[min(250px,var(--radix-popper-available-height))]">
            <CommandEmpty>No currency found.</CommandEmpty>

            <CommandGroup heading="Recommended">
              {recommended.map((c) => (
                <CurrencyItem
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

            <CommandGroup heading="All currencies">
              {other.map((c) => (
                <CurrencyItem
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

function CurrencyItem({
  option,
  isSelected,
  onSelect,
}: {
  option: CurrencyOption;
  isSelected: boolean;
  onSelect: () => void;
}) {
  // cmdk searches the `value` prop — pack name + code so "euro" and "EUR" both hit.
  return (
    <CommandItem value={`${option.name} ${option.code}`} onSelect={onSelect}>
      <Check
        className={cn("size-4 shrink-0", isSelected ? "opacity-100" : "opacity-0")}
      />
      <span className="flex-1 truncate">{option.name}</span>
      <span className="ml-2 shrink-0 text-xs text-muted-foreground">
        {option.code}
      </span>
    </CommandItem>
  );
}
