"use client";

import * as React from "react";
import { Check } from "lucide-react";

import {
  Card,
  CardHeader,
  CardTitle,
  CardAction,
  CardContent,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

type StepState = "done" | "current" | "pending";

const STEPS: { label: string; state: StepState }[] = [
  { label: "Принят", state: "done" },
  { label: "Готовится", state: "current" },
  { label: "Готов", state: "pending" },
];

function StepIndicator({ state }: { state: StepState }) {
  if (state === "done") {
    return (
      <span className="grid size-5 place-items-center rounded-full bg-primary text-primary-foreground">
        <Check className="size-3" />
      </span>
    );
  }
  if (state === "current") {
    return <span className="size-5 rounded-full border-2 border-foreground" />;
  }
  return <span className="size-5 rounded-full border border-border" />;
}

export function OrderStatusWidget() {
  return (
    <Card className="w-full gap-0 py-0">
      <CardHeader className="p-4">
        <CardTitle>
          Заказ <span className="font-mono tabular-nums">№1042</span>
        </CardTitle>
        <CardAction>
          <Badge variant="secondary">Готовится</Badge>
        </CardAction>
      </CardHeader>

      <CardContent className="space-y-3 p-4 pt-0">
        {STEPS.map((step, i) => (
          <div key={step.label} className="flex items-center gap-3">
            <div className="flex flex-col items-center">
              <StepIndicator state={step.state} />
              {i < STEPS.length - 1 ? (
                <span className="mt-1 h-3 w-px bg-border" />
              ) : null}
            </div>
            <span
              className={
                step.state === "pending"
                  ? "text-sm text-muted-foreground"
                  : "text-sm font-medium"
              }
            >
              {step.label}
            </span>
          </div>
        ))}

        <p className="pt-1 text-sm text-muted-foreground">
          Готово примерно через <span className="font-mono tabular-nums">10</span> мин
        </p>
      </CardContent>
    </Card>
  );
}
