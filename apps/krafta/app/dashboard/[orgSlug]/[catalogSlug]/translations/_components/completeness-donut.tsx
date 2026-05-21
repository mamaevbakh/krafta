"use client";

import * as React from "react";
import {
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
} from "recharts";

/**
 * Three-segment donut showing overall translation completeness at a glance.
 *
 * Lives in the persistent panel header next to the linear progress bar.
 * The two visualisations answer different questions:
 *   - Linear bar  → "where am I in the journey?" (left-to-right progress)
 *   - Donut       → "what's the mix?" (relative slice sizes)
 *
 * Built with Recharts so we have a clean upgrade path for time-series /
 * stacked-bar / multi-axis charts when S2 (realtime) and S3 (source mix
 * donuts per language) land — single chart library, single theme.
 *
 * Colors come from Tailwind classes resolved at runtime via CSS custom
 * properties Recharts can read. We avoid hard-coding hex so dark-mode
 * inversion stays consistent with the rest of the workbench.
 */

export type CompletenessDonutProps = {
  translated: number;
  needsReview: number;
  notTranslated: number;
  /** Pre-rounded percentage shown in the center (0–100). */
  completePct: number;
  /** Diameter in pixels (default 120). The chart is square; outer ring
   *  ≈ size/2, inner ring ≈ size/2 - strokeWidth. */
  size?: number;
};

export function CompletenessDonut({
  translated,
  needsReview,
  notTranslated,
  completePct,
  size = 120,
}: CompletenessDonutProps) {
  const total = translated + needsReview + notTranslated;

  // Recharts collapses zero-value slices entirely; pad with a placeholder
  // so the donut still renders as a hollow ring on a brand-new catalog
  // ("0% translated" reads as the donut outline, not nothing).
  const data = React.useMemo(() => {
    if (total === 0) {
      return [{ key: "placeholder", value: 1, fill: "var(--muted)" }];
    }
    return [
      {
        key: "translated",
        value: translated,
        // Emerald 500 — same green used elsewhere for "done" state.
        fill: "rgb(16 185 129)",
      },
      {
        key: "needs-review",
        value: needsReview,
        // Amber 500 — same as the "needs review" badges.
        fill: "rgb(245 158 11)",
      },
      {
        key: "not-translated",
        value: notTranslated,
        // Muted ring slot — uses the theme's muted color so dark/light
        // mode swaps without overriding.
        fill: "rgb(120 113 108 / 0.25)",
      },
    ];
  }, [translated, needsReview, notTranslated, total]);

  const radius = size / 2;
  // Donut hole = 60% of outer radius. Leaves a visible ring without
  // crowding the center label.
  const innerRadius = Math.round(radius * 0.62);
  const outerRadius = Math.round(radius * 0.95);

  return (
    <div
      className="relative shrink-0"
      style={{ width: size, height: size }}
      role="img"
      aria-label={`${completePct}% of translations done. ${translated} translated, ${needsReview} need review, ${notTranslated} not translated.`}
    >
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={data}
            cx="50%"
            cy="50%"
            innerRadius={innerRadius}
            outerRadius={outerRadius}
            // Tiny gap between segments reads as "these are distinct
            // categories" without breaking the ring silhouette.
            paddingAngle={total === 0 ? 0 : 2}
            dataKey="value"
            stroke="none"
            // Disable hover animations — we want the chart to feel
            // chrome-like (a status display), not playful.
            isAnimationActive={false}
          >
            {data.map((d) => (
              <Cell key={d.key} fill={d.fill} />
            ))}
          </Pie>
          {/* Recharts tooltip — shows segment counts on hover. Keep it
              lightweight; the chart's job is the at-a-glance picture. */}
          {total > 0 && (
            <RechartsTooltip
              cursor={false}
              wrapperStyle={{ outline: "none" }}
              contentStyle={{
                background: "var(--popover)",
                border: "1px solid var(--border)",
                borderRadius: "6px",
                fontSize: "12px",
                color: "var(--popover-foreground)",
              }}
              labelStyle={{ display: "none" }}
              formatter={(value: number, _name, entry) => {
                const labels: Record<string, string> = {
                  translated: "Translated",
                  "needs-review": "Needs review",
                  "not-translated": "Not translated",
                };
                const key = entry.payload.key as string;
                return [`${value}`, labels[key] ?? key];
              }}
            />
          )}
        </PieChart>
      </ResponsiveContainer>

      {/* Center label — absolutely-positioned because Recharts doesn't
          have a clean "label-in-donut-hole" API. The wrapping div is
          relative; this div centers itself. pointer-events-none keeps
          the underlying chart's hover working. */}
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
        <span className="text-2xl font-semibold leading-none tabular-nums">
          {completePct}%
        </span>
        <span className="mt-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
          translated
        </span>
      </div>
    </div>
  );
}
