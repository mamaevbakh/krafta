"use client";

import * as React from "react";

import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";

// In-chat item configurator — pick size + milk, see a running total, add to
// cart or check out. Composed from shadcn Card / Button / Separator; selection
// is variant="default" vs "outline". Bespoke classes are layout + the
// mandatory `font-mono tabular-nums` on every price. UZS: comma thousands, no
// decimals. No color, no gradients.

const BASE = 24000;

const SIZES = [
  { id: "S", label: "S", add: 0 },
  { id: "M", label: "M", add: 5000 },
  { id: "L", label: "L", add: 9000 },
];

const MILKS = [
  { id: "regular", label: "Обычное", add: 0 },
  { id: "oat", label: "Овсяное", add: 5000 },
  { id: "lactose", label: "Без лактозы", add: 4000 },
];

function format(value: number) {
  return value.toLocaleString("en-US");
}

export function ItemConfiguratorWidget() {
  const [size, setSize] = React.useState("M");
  const [milk, setMilk] = React.useState("oat");

  const sizeAdd = SIZES.find((s) => s.id === size)?.add ?? 0;
  const milkAdd = MILKS.find((m) => m.id === milk)?.add ?? 0;
  const total = BASE + sizeAdd + milkAdd;

  return (
    <Card className="w-full gap-0 py-0">
      <CardContent className="space-y-4 p-4">
        <div className="aspect-[4/3] w-full rounded-lg bg-muted" />

        <div className="min-w-0 space-y-0.5">
          <p className="text-base font-semibold">Латте</p>
          <p className="text-sm text-muted-foreground">
            Эспрессо с молоком и тонкой пенкой
          </p>
        </div>

        <div className="space-y-2">
          <p className="text-sm font-medium">Размер</p>
          <div className="flex items-center gap-2">
            {SIZES.map((s) => (
              <Button
                key={s.id}
                variant={size === s.id ? "default" : "outline"}
                size="sm"
                className="flex-1"
                onClick={() => setSize(s.id)}
              >
                {s.label}
              </Button>
            ))}
          </div>
        </div>

        <div className="space-y-2">
          <p className="text-sm font-medium">Молоко</p>
          <div className="space-y-1.5">
            {MILKS.map((m) => (
              <Button
                key={m.id}
                variant={milk === m.id ? "default" : "outline"}
                className="w-full justify-between"
                onClick={() => setMilk(m.id)}
              >
                <span>{m.label}</span>
                <span className="font-mono tabular-nums">
                  {m.add > 0 ? `+${format(m.add)}` : "0"}
                </span>
              </Button>
            ))}
          </div>
        </div>

        <Separator />

        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">Итого</span>
          <span className="font-mono font-semibold tabular-nums">
            {format(total)}
          </span>
        </div>
      </CardContent>

      <CardFooter className="flex-col gap-2 p-4 pt-0">
        <Button className="w-full">
          Добавить ·{" "}
          <span className="font-mono tabular-nums">{format(total)}</span>
        </Button>
        <Button variant="outline" className="w-full">
          Оформить заказ
        </Button>
      </CardFooter>
    </Card>
  );
}
