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
import {
  LOCALES,
  RECOMMENDED_LOCALES,
  OTHER_LOCALES,
  getLocaleDefinition,
  type LocaleDefinition,
} from "@/lib/locales/registry";

/**
 * Grouped locale picker used in AddLocaleDialog.
 *
 * Built on the shadcn Command primitives (the underlying composable layer
 * Combobox wraps) so we get the multi-group + separator pattern Combobox's
 * flat-options API can't express.
 *
 * Groups:
 *   1. Recommended — Tashkent + adjacent regional markets (top)
 *   2. All languages — alphabetical by English name (bottom)
 *
 * Search is fuzzy across nativeName + englishName + code, so a merchant
 * typing "rus" finds "Русский", "ar" finds "العربية", and "uz" finds both
 * Latin + Cyrillic Uzbek.
 *
 * Already-added locales are filtered out via `excludeCodes`.
 */

export type LocalePickerProps = {
  value: string | null;
  onChange: (code: string) => void;
  excludeCodes?: string[];
  disabled?: boolean;
  id?: string;
};

export function LocalePicker({
  value,
  onChange,
  excludeCodes = [],
  disabled = false,
  id,
}: LocalePickerProps) {
  const [open, setOpen] = React.useState(false);

  const excludeSet = React.useMemo(
    () => new Set(excludeCodes),
    [excludeCodes],
  );

  const selected = React.useMemo<LocaleDefinition | null>(
    () => (value ? getLocaleDefinition(value) ?? null : null),
    [value],
  );

  const availableRecommended = React.useMemo(
    () => RECOMMENDED_LOCALES.filter((l) => !excludeSet.has(l.code)),
    [excludeSet],
  );
  const availableOther = React.useMemo(
    () => OTHER_LOCALES.filter((l) => !excludeSet.has(l.code)),
    [excludeSet],
  );

  const totalAvailable = availableRecommended.length + availableOther.length;

  return (
    // `modal` is required when the Popover lives inside a Dialog. Without
    // it Radix's Dialog focus trap intercepts wheel events meant for the
    // Popover content — the list looks scrollable but doesn't scroll.
    // `modal` makes the Popover self-contained: its own focus trap, its
    // own wheel handling, no conflict with the surrounding Dialog.
    <Popover open={open} onOpenChange={setOpen} modal>
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled || totalAvailable === 0}
          className={cn(
            "w-full justify-between font-normal",
            !selected && "text-muted-foreground",
          )}
        >
          {selected ? (
            <span className="flex min-w-0 items-baseline gap-2">
              <span className="truncate">{selected.nativeName}</span>
              <span className="shrink-0 text-xs text-muted-foreground">
                {selected.englishName}
              </span>
            </span>
          ) : (
            <span className="truncate">
              {totalAvailable === 0
                ? "All registered languages added"
                : "Select a language"}
            </span>
          )}
          <ChevronsUpDown className="ml-2 size-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-[var(--radix-popover-trigger-width)] p-0"
      >
        <Command
          // Custom filter: match across nativeName + englishName + code so
          // typing "russian", "ru", "Русский", or even "русский" all match.
          // Defaults to the option's `value` prop which we pack with all
          // search-relevant text.
        >
          <CommandInput placeholder="Search languages..." />
          <CommandList className="max-h-[min(60vh,400px)]">
            <CommandEmpty>No language found.</CommandEmpty>

            {availableRecommended.length > 0 && (
              <CommandGroup heading="Recommended">
                {availableRecommended.map((locale) => (
                  <LocaleItem
                    key={locale.code}
                    locale={locale}
                    isSelected={locale.code === value}
                    onSelect={() => {
                      onChange(locale.code);
                      setOpen(false);
                    }}
                  />
                ))}
              </CommandGroup>
            )}

            {availableRecommended.length > 0 && availableOther.length > 0 && (
              <CommandSeparator />
            )}

            {availableOther.length > 0 && (
              <CommandGroup heading="All languages">
                {availableOther.map((locale) => (
                  <LocaleItem
                    key={locale.code}
                    locale={locale}
                    isSelected={locale.code === value}
                    onSelect={() => {
                      onChange(locale.code);
                      setOpen(false);
                    }}
                  />
                ))}
              </CommandGroup>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

function LocaleItem({
  locale,
  isSelected,
  onSelect,
}: {
  locale: LocaleDefinition;
  isSelected: boolean;
  onSelect: () => void;
}) {
  // cmdk searches against the `value` prop. Pack all three forms so search
  // works regardless of which name the merchant remembers.
  const searchValue = `${locale.nativeName} ${locale.englishName} ${locale.code}`;

  return (
    <CommandItem value={searchValue} onSelect={onSelect}>
      <Check
        className={cn(
          "size-4 shrink-0",
          isSelected ? "opacity-100" : "opacity-0",
        )}
      />
      <span className="flex-1 truncate" lang={locale.code}>
        {locale.nativeName}
      </span>
      <span className="ml-2 shrink-0 text-xs text-muted-foreground">
        {locale.englishName}
        {locale.direction === "rtl" && (
          <span className="ml-1 rounded border px-1 py-0 text-[9px] uppercase">
            RTL
          </span>
        )}
      </span>
    </CommandItem>
  );
}

void LOCALES; // referenced by registry consumers; keep import alive
