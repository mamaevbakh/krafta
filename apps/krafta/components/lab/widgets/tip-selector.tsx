"use client";

import * as React from "react";

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";

const OPTIONS = [
  { id: "none", label: "Без чаевых", numeric: false, amount: "0" },
  { id: "5", label: "5%", numeric: true, amount: "4,100" },
  { id: "10", label: "10%", numeric: true, amount: "8,200" },
  { id: "other", label: "Другое", numeric: false, amount: "12,000" },
];

export function TipWidget() {
  const [selected, setSelected] = React.useState("10");
  const active = OPTIONS.find((o) => o.id === selected) ?? OPTIONS[0];

  return (
    <Card className="w-full gap-0 py-0">
      <CardHeader className="p-4">
        <CardTitle>Чаевые</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 p-4 pt-0">
        <div className="flex flex-wrap gap-2">
          {OPTIONS.map((option) => (
            <Button
              key={option.id}
              size="sm"
              variant={selected === option.id ? "default" : "outline"}
              onClick={() => setSelected(option.id)}
            >
              {option.numeric ? (
                <span className="font-mono tabular-nums">{option.label}</span>
              ) : (
                option.label
              )}
            </Button>
          ))}
        </div>
        <p className="font-mono text-lg font-semibold tabular-nums">
          {active.amount}
        </p>
      </CardContent>
    </Card>
  );
}
