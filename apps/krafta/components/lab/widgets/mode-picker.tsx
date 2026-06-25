"use client";

import * as React from "react";
import { Utensils, ShoppingBag, Bike } from "lucide-react";

import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

const MODES = [
  { id: "dine-in", label: "В зале", icon: Utensils },
  { id: "pickup", label: "Самовывоз", icon: ShoppingBag },
  { id: "delivery", label: "Доставка", icon: Bike },
] as const;

export function ModePickerWidget() {
  const [selected, setSelected] = React.useState<string>("dine-in");

  return (
    <Card className="w-full gap-0 py-0">
      <CardHeader className="p-4">
        <CardTitle>Как получить заказ?</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2 p-4 pt-0">
        {MODES.map((mode) => {
          const Icon = mode.icon;
          const isActive = selected === mode.id;
          return (
            <Button
              key={mode.id}
              variant={isActive ? "default" : "outline"}
              className="w-full justify-start gap-2"
              onClick={() => setSelected(mode.id)}
            >
              <Icon />
              {mode.label}
            </Button>
          );
        })}
      </CardContent>
    </Card>
  );
}
