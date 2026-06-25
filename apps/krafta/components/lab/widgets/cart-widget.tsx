"use client";

import * as React from "react";
import { Minus, Plus, Trash2 } from "lucide-react";

import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";

// REFERENCE WIDGET — the canonical pattern for the gallery. Composed entirely
// from shadcn primitives (Card / Button / Separator); the only bespoke classes
// are layout (flex / gap / justify) and the mandatory `font-mono tabular-nums`
// on every number. UZS prices: comma thousands, no decimals. No raw re-styled
// cards or buttons. No color, no gradients.

const LINES = [
  { id: "1", name: "Капучино", spec: "M · Овсяное · Карамель", qty: 1, total: "38,000" },
  { id: "2", name: "Круассан", spec: "Миндальный", qty: 2, total: "44,000" },
];

export function CartWidget() {
  return (
    <Card className="w-full gap-0 py-0">
      <CardContent className="space-y-3 p-4">
        {LINES.map((line) => (
          <div key={line.id} className="flex items-start gap-3">
            <div className="size-12 shrink-0 rounded-md bg-muted" />
            <div className="min-w-0 flex-1 pt-0.5">
              <p className="truncate text-sm font-medium">{line.name}</p>
              <p className="truncate text-xs text-muted-foreground">{line.spec}</p>
            </div>
            <div className="flex shrink-0 flex-col items-end gap-1.5">
              <div className="flex items-center gap-0.5 rounded-full border">
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-7 rounded-full"
                  aria-label={line.qty <= 1 ? "Remove" : "Decrease"}
                >
                  {line.qty <= 1 ? <Trash2 /> : <Minus />}
                </Button>
                <span className="min-w-4 text-center text-sm font-semibold tabular-nums">
                  {line.qty}
                </span>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-7 rounded-full"
                  aria-label="Increase"
                >
                  <Plus />
                </Button>
              </div>
              <span className="font-mono text-sm font-semibold tabular-nums">
                {line.total}
              </span>
            </div>
          </div>
        ))}
      </CardContent>

      <Separator />

      <CardContent className="space-y-1.5 p-4 text-sm">
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground">Подытог</span>
          <span className="font-mono tabular-nums">82,000</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground">Сервисный сбор 10%</span>
          <span className="font-mono tabular-nums">8,200</span>
        </div>
        <div className="flex items-center justify-between font-semibold">
          <span>Итого</span>
          <span className="font-mono tabular-nums">90,200</span>
        </div>
      </CardContent>

      <CardFooter className="flex-col gap-2 p-4 pt-0">
        <Button className="w-full">Оформить заказ</Button>
        <Button variant="outline" className="w-full">
          Продолжить покупки
        </Button>
      </CardFooter>
    </Card>
  );
}
