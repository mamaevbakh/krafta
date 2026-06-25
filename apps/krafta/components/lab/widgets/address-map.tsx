"use client";

import * as React from "react";
import { LocateFixed, MapPin } from "lucide-react";

import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export function AddressMapWidget() {
  return (
    <Card className="w-full gap-0 py-0">
      <CardHeader className="p-4">
        <CardTitle>Адрес доставки</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 p-4 pt-0">
        <div className="relative aspect-video w-full overflow-hidden rounded-lg bg-muted">
          <svg
            className="absolute inset-0 size-full"
            viewBox="0 0 320 180"
            fill="none"
            aria-hidden="true"
          >
            <path
              d="M40 140 C 110 120, 150 70, 220 60"
              className="stroke-foreground"
              strokeWidth="2"
              strokeLinecap="round"
              strokeDasharray="1 7"
            />
            <circle cx="40" cy="140" r="3" className="fill-foreground" />
            <circle cx="220" cy="60" r="3" className="fill-foreground" />
          </svg>
          <div className="absolute inset-0 grid place-items-center">
            <MapPin className="size-6 text-foreground" />
          </div>
        </div>
        <p className="text-sm">ул. Амира Темура, 15</p>
        <Button variant="outline" className="w-full">
          <LocateFixed />
          Использовать моё местоположение
        </Button>
      </CardContent>
      <CardFooter className="p-4 pt-0">
        <Button className="w-full">Продолжить</Button>
      </CardFooter>
    </Card>
  );
}
