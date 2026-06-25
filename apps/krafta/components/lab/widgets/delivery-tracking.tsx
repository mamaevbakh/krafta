"use client";

import * as React from "react";
import { MapPin, Phone } from "lucide-react";

import {
  Card,
  CardHeader,
  CardTitle,
  CardAction,
  CardContent,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";

export function DeliveryTrackingWidget() {
  return (
    <Card className="w-full gap-0 py-0">
      <CardHeader className="p-4">
        <CardTitle>В пути</CardTitle>
        <CardAction>
          <span className="font-mono text-sm tabular-nums">12 мин</span>
        </CardAction>
      </CardHeader>

      <CardContent className="space-y-3 p-4 pt-0">
        {/* route strip — monochrome placeholder, no real map, no color */}
        <div className="relative aspect-[16/9] w-full overflow-hidden rounded-lg bg-muted">
          <svg
            viewBox="0 0 320 180"
            className="absolute inset-0 size-full"
            fill="none"
            preserveAspectRatio="none"
          >
            <path
              d="M40 140 C 110 150, 120 60, 200 70 S 280 50, 290 40"
              className="stroke-foreground"
              strokeWidth="2"
              strokeLinecap="round"
              strokeDasharray="2 7"
              opacity="0.7"
            />
            <circle cx="40" cy="140" r="5" className="fill-foreground" />
          </svg>
          <MapPin className="absolute right-[6%] top-[14%] size-5 text-foreground" />
        </div>

        {/* courier row */}
        <div className="flex items-center gap-3">
          <Avatar>
            <AvatarFallback>A</AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">Aziz</p>
            <p className="truncate text-xs text-muted-foreground">Курьер</p>
          </div>
          <Button variant="outline" size="icon" aria-label="Позвонить курьеру">
            <Phone />
          </Button>
        </div>

        <p className="text-sm">Amir Temur 15, kv. 42</p>
      </CardContent>
    </Card>
  );
}
