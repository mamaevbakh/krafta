"use client";

import * as React from "react";

import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  CardFooter,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function ScheduleQuestionWidget() {
  const [scheduled, setScheduled] = React.useState(false);

  return (
    <Card className="w-full gap-0 py-0">
      <CardHeader className="p-4">
        <CardTitle>Когда приготовить?</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2 p-4 pt-0">
        <div className="grid grid-cols-2 gap-2">
          <Button
            variant={scheduled ? "outline" : "default"}
            onClick={() => setScheduled(false)}
          >
            Как можно скорее
          </Button>
          <Button
            variant={scheduled ? "default" : "outline"}
            onClick={() => setScheduled(true)}
          >
            Ко времени
          </Button>
        </div>
        {scheduled ? (
          <Input type="datetime-local" className="font-mono tabular-nums" />
        ) : null}
      </CardContent>
      <CardFooter className="p-4 pt-0">
        <Button className="w-full">Далее</Button>
      </CardFooter>
    </Card>
  );
}
