import Link from "next/link";
import { ArrowUpRight, BookOpenText, Component, KeyRound, Rocket, ScrollText } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";

const sections = [
  {
    title: "Getting Started",
    description: "Project structure, local development, and deployment.",
    href: "/docs/getting-started",
    icon: Rocket,
  },
  {
    title: "Auth & SSO",
    description: "Central auth flows for krafta.org, pay.krafta.org, and subdomains.",
    href: "/docs/auth-sso",
    icon: KeyRound,
  },
  {
    title: "Catalog Onboarding",
    description: "Guest draft creation, preview, publish gate, and organization attach flow.",
    href: "/docs/catalog-first-onboarding",
    icon: BookOpenText,
  },
  {
    title: "Components",
    description: "Shared UI patterns and design primitives across Krafta apps.",
    href: "/docs",
    icon: Component,
  },
  {
    title: "API Reference",
    description: "Route handlers, request contracts, and response examples.",
    href: "/api/docs/index",
    icon: ScrollText,
  },
];

export default function Page() {
  return (
    <main className="min-h-screen bg-background px-6 py-10 md:px-10">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-8">
        <div className="flex flex-col gap-4">
          <Badge variant="secondary" className="w-fit">
            docs.krafta.org
          </Badge>
          <div className="space-y-2">
            <h1 className="text-3xl font-semibold tracking-tight md:text-4xl">
              Krafta Documentation
            </h1>
            <p className="max-w-2xl text-sm text-muted-foreground md:text-base">
              Central documentation library for Krafta product architecture, authentication,
              onboarding, and platform APIs.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Button nativeButton={false} render={<Link href="/docs" />}>
                Open docs index
                <ArrowUpRight className="size-4" />
            </Button>
            <Button nativeButton={false} variant="outline" render={<Link href="/docs/getting-started" />}>Read getting started</Button>
          </div>
        </div>

        <Separator />

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {sections.map((section) => {
            const Icon = section.icon;
            return (
              <Card key={section.title} className="h-full">
                <CardHeader className="space-y-3">
                  <div className="w-fit rounded-md border p-2 text-muted-foreground">
                    <Icon className="size-4" />
                  </div>
                  <div className="space-y-1">
                    <CardTitle className="text-lg">{section.title}</CardTitle>
                    <CardDescription>{section.description}</CardDescription>
                  </div>
                </CardHeader>
                <CardContent>
                  <Button
                    nativeButton={false}
                    variant="ghost"
                    className="px-0"
                    render={<Link href={section.href} />}
                  >
                      Open section
                      <ArrowUpRight className="size-4" />
                  </Button>
                </CardContent>
              </Card>
            );
          })}
        </section>
      </div>
    </main>
  );
}
