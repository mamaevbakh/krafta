"use client";

import * as React from "react";
import { Plus } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

// Single product search-result card — what the assistant surfaces for a found
// item. Composed from shadcn Card + Button only; bespoke classes are layout
// and the mandatory `font-mono tabular-nums` on the price. UZS: comma
// thousands, no decimals. No color, no gradients.

export function ResultCardWidget() {
  return (
    <Card className="w-full gap-0 py-0">
      <CardContent className="space-y-3 p-3">
        <div className="aspect-square w-full rounded-lg bg-muted" />
        <div className="min-w-0 space-y-0.5">
          <p className="truncate text-sm font-medium">Раф ванильный</p>
          <p className="truncate text-xs text-muted-foreground">
            Сливочный кофе с ванилью
          </p>
        </div>
        <div className="flex items-center justify-between gap-2">
          <span className="font-mono text-sm font-semibold tabular-nums">
            28,000
          </span>
          <Button size="sm">
            <Plus />
            Добавить
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
