"use client";

/**
 * mode-toggle.tsx — customer-facing light/dark/system theme switcher.
 *
 * Sibling to LocaleSwitcher: same secondary-tone icon button (rounded-full,
 * bg-muted) so the two affordances read as one cluster in the header
 * top-right. The Sun/Moon icons cross-fade + rotate on theme change —
 * lifted from shadcn's stock ModeToggle so the motion vocabulary matches
 * the rest of the system.
 *
 * Dropdown items: Light / Dark / System. System honors the customer's OS
 * setting (next-themes defaults to system on first visit per the layout
 * config: `defaultTheme="system" enableSystem`).
 *
 * Visual: matches LocaleSwitcher exactly so both icons read as siblings
 * in the same visual family. Rounded-full keeps the affordance consistent
 * with the dock's pill chrome and the cart trigger.
 */

import * as React from "react";
import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useStorefrontLocale } from "@/lib/catalogs/storefront-locale-context";
import { getStorefrontMessage } from "@/lib/locales/messages";
import { cn } from "@/lib/utils";

type ModeToggleProps = {
  /** Optional class override on the trigger button — for header layouts
   *  that need a different margin / colour. */
  className?: string;
};

export function ModeToggle({ className }: ModeToggleProps) {
  const { theme, setTheme } = useTheme();
  const { activeLocale, defaultLocale } = useStorefrontLocale();
  const label = (key: Parameters<typeof getStorefrontMessage>[0]) =>
    getStorefrontMessage(key, { activeLocale, defaultLocale });

  // Avoid hydration mismatch: theme is undefined on the server and on
  // the first client render before next-themes reads the cookie.
  // Render the button (so SSR HTML matches the empty client tree) but
  // leave the radio value unset until mount so we don't paint the wrong
  // selected dot for half a frame.
  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => {
    setMounted(true);
  }, []);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          size="icon"
          variant="outline"
          aria-label={label("theme.toggle_aria")}
          // Inside the Mini App the theme follows Telegram automatically
          // (TelegramThemeSync), so this manual control is redundant — hide
          // it in-app via .tg-app [data-tg-hide]. Stays visible on the web.
          data-tg-hide
          className={cn(
            // Match LocaleSwitcher / cart-trigger tonality so the three
            // icon buttons read as siblings in the same visual family.
            "rounded-full bg-muted text-foreground hover:bg-muted/80",
            className,
          )}
        >
          <Sun className="size-4 scale-100 rotate-0 transition-all dark:scale-0 dark:-rotate-90" />
          <Moon className="absolute size-4 scale-0 rotate-90 transition-all dark:scale-100 dark:rotate-0" />
          <span className="sr-only">{label("theme.toggle_aria")}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-[8rem]">
        <DropdownMenuRadioGroup
          value={mounted ? theme : undefined}
          onValueChange={setTheme}
        >
          <DropdownMenuRadioItem value="light" className="text-sm">
            {label("theme.light")}
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="dark" className="text-sm">
            {label("theme.dark")}
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="system" className="text-sm">
            {label("theme.system")}
          </DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
