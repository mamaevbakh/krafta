"use client";

import { useEffect, useState } from "react";
import { useTheme } from "next-themes";
import { Monitor, Moon, Sun } from "lucide-react";

import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useT } from "@/lib/locales/context";

/**
 * Light / dark / system, in the account menu beside sign-out.
 *
 * Mounted-gated because next-themes cannot know the resolved theme on the
 * server: rendering the real value straight away makes the server and client
 * disagree, and React replaces the whole control on hydration. Rendering the
 * same three buttons with nothing selected avoids that without a layout shift.
 */
export function ThemeSwitcher() {
  const t = useT();
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const options = [
    { value: "light", Icon: Sun, labelKey: "nav.theme.light" },
    { value: "dark", Icon: Moon, labelKey: "nav.theme.dark" },
    { value: "system", Icon: Monitor, labelKey: "nav.theme.system" },
  ] as const;

  return (
    <ToggleGroup
      value={mounted && theme ? [theme] : []}
      onValueChange={(v) => {
        const next = v[v.length - 1];
        if (next) setTheme(next);
      }}
      variant="outline"
      size="sm"
      className="w-full"
    >
      {options.map(({ value, Icon, labelKey }) => (
        <ToggleGroupItem key={value} value={value} className="flex-1" aria-label={t(labelKey)}>
          <Icon className="size-4" aria-hidden />
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}
