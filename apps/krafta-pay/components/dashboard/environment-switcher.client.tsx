"use client";

import { useTransition } from "react";
import { setDashboardEnvironmentAction } from "@/lib/dashboard-env-actions";
import type { DashboardEnvironment } from "@/lib/dashboard-env";
import { useT } from "@/lib/locales/context";
import { cn } from "@/lib/utils";

/**
 * Test / live toggle.
 *
 * This sits where a static "Test mode / Live" pill used to — a label that
 * merely reported a server env var the merchant could not change. Reading the
 * mode without being able to switch it is what made test mode unreachable in
 * production: you connected test credentials and the dashboard, pinned to
 * live, told you that you had no provider.
 *
 * A segmented control rather than a dropdown, because there are exactly two
 * states and which one you are in changes the meaning of every number on the
 * screen. It should be legible at a glance, not one click away.
 */
export function EnvironmentSwitcher({ environment }: { environment: DashboardEnvironment }) {
  const t = useT();
  const [pending, startTransition] = useTransition();

  function select(next: DashboardEnvironment) {
    if (next === environment || pending) return;
    startTransition(() => {
      void setDashboardEnvironmentAction(next);
    });
  }

  return (
    <div
      role="group"
      aria-label={t("env.test")}
      className={cn(
        "inline-flex items-center gap-0.5 rounded-full border p-0.5",
        pending && "opacity-60",
      )}
    >
      {(["live", "test"] as const).map((value) => {
        const active = environment === value;
        return (
          <button
            key={value}
            type="button"
            onClick={() => select(value)}
            aria-pressed={active}
            disabled={pending}
            className={cn(
              "rounded-full px-2 py-0.5 text-[11px] font-medium transition-colors",
              active
                ? value === "test"
                  ? "bg-amber-500/15 text-amber-600 dark:text-amber-400"
                  : "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {value === "test" ? t("env.test") : t("env.live")}
          </button>
        );
      })}
    </div>
  );
}
