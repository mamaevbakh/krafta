"use client";

import * as React from "react";

import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";

const LINES = [
  { id: "1", qty: 2, name: "Капучино", total: "76,000" },
  { id: "2", qty: 1, name: "Круассан", total: "6,000" },
];

export function CheckoutReviewWidget() {
  return (
    <Card className="w-full gap-0 py-0">
      <CardHeader className="p-4 pb-0">
        <CardTitle>Ваш заказ</CardTitle>
      </CardHeader>

      <CardContent className="space-y-1 p-4">
        {LINES.map((line) => (
          <div key={line.id} className="flex items-center justify-between gap-3">
            <span className="min-w-0 truncate text-sm">
              <span className="font-mono tabular-nums">{line.qty}</span>×{" "}
              {line.name}
            </span>
            <span className="shrink-0 font-mono text-sm tabular-nums">
              {line.total}
            </span>
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
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground">Доставка</span>
          <span className="font-mono tabular-nums">0</span>
        </div>
        <div className="flex items-center justify-between font-semibold">
          <span>Итого</span>
          <span className="font-mono tabular-nums">90,200</span>
        </div>
      </CardContent>

      <CardFooter className="p-4 pt-0">
        <Button className="w-full">
          Оформить заказ ·{" "}
          <span className="font-mono tabular-nums">90,200</span>
        </Button>
      </CardFooter>
    </Card>
  );
}
