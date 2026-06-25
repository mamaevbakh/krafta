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
import { Label } from "@/components/ui/label";

export function TableQuestionWidget() {
  const [table, setTable] = React.useState("");

  return (
    <Card className="w-full gap-0 py-0">
      <CardHeader className="p-4">
        <CardTitle>Номер стола</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2 p-4 pt-0">
        <Label htmlFor="table-number">Стол</Label>
        <Input
          id="table-number"
          inputMode="numeric"
          placeholder="напр. 12"
          value={table}
          onChange={(e) => setTable(e.target.value)}
          className="font-mono tabular-nums"
        />
      </CardContent>
      <CardFooter className="p-4 pt-0">
        <Button className="w-full">Далее</Button>
      </CardFooter>
    </Card>
  );
}
