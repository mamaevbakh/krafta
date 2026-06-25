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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function ContactQuestionWidget() {
  return (
    <Card className="w-full gap-0 py-0">
      <CardHeader className="p-4">
        <CardTitle>Контакты</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 p-4 pt-0">
        <div className="space-y-1.5">
          <Label htmlFor="contact-name">Имя</Label>
          <Input id="contact-name" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="contact-phone">Телефон</Label>
          <Input id="contact-phone" placeholder="+998…" />
        </div>
      </CardContent>
      <CardFooter className="p-4 pt-0">
        <Button className="w-full">Далее</Button>
      </CardFooter>
    </Card>
  );
}
