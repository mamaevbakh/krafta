"use client";

import * as React from "react";
import { Clock, Bike, MapPin } from "lucide-react";

import {
  Card,
  CardHeader,
  CardTitle,
  CardAction,
  CardContent,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

const MODES = ["В зале", "Самовывоз", "Доставка"];

export function ShopInfoWidget() {
  return (
    <Card className="w-full gap-0 py-0">
      <CardHeader className="p-4">
        <CardTitle>Vintage Coffee</CardTitle>
        <CardAction>
          <Badge variant="secondary">Открыто</Badge>
        </CardAction>
      </CardHeader>

      <CardContent className="space-y-2 p-4 pt-0 text-sm">
        <div className="flex items-center gap-2">
          <Clock className="size-4 shrink-0 text-muted-foreground" />
          <span className="font-mono tabular-nums">08:00 – 22:00</span>
        </div>
        <div className="flex items-center gap-2">
          <Bike className="size-4 shrink-0 text-muted-foreground" />
          <span>
            Доставка от <span className="font-mono tabular-nums">15,000</span> · до{" "}
            <span className="font-mono tabular-nums">5</span> км
          </span>
        </div>
        <div className="flex items-center gap-2">
          <MapPin className="size-4 shrink-0 text-muted-foreground" />
          <span>Amir Temur 15, Tashkent</span>
        </div>

        <div className="flex flex-wrap gap-1.5 pt-1">
          {MODES.map((mode) => (
            <Badge key={mode} variant="outline">
              {mode}
            </Badge>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
