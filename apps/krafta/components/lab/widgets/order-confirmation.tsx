"use client";

import * as React from "react";
import { Check } from "lucide-react";

import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export function OrderConfirmationWidget() {
  return (
    <Card className="w-full">
      <CardContent className="flex flex-col items-center gap-3 p-6 text-center">
        <div className="grid size-12 place-items-center rounded-full bg-primary text-primary-foreground">
          <Check className="size-6" />
        </div>
        <p className="font-medium">Заказ оформлен</p>
        <p className="text-sm text-muted-foreground">
          Оплата наличными при получении
        </p>
        <div className="flex items-center gap-2">
          <span className="font-mono text-sm tabular-nums">№ 1042</span>
          <Badge variant="secondary">Самовывоз</Badge>
        </div>
      </CardContent>

      <CardFooter className="p-4 pt-0">
        <Button variant="outline" className="w-full">
          Начать новый заказ
        </Button>
      </CardFooter>
    </Card>
  );
}
