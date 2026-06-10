"use client";

// KRA-42 / ADR 0005 §2 — the "2 + Studio" wizard. Two load-bearing inputs:
// ① vertical (drives the starter catalog + default modes) and ② shop name
// (drives the storefront identity on the canvas). No slug UI here — the
// merchant-facing slug is chosen at Publish (D17). Tapping a vertical
// advances immediately; ② submits the seed RPC and lands in the Studio.

import * as React from "react";
import { useActionState } from "react";
import { ArrowLeft, ChevronRight, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import { createShopFromWizard, type CreateShopState } from "./actions";
import { VERTICALS, VERTICAL_KEYS, type ShopVertical } from "./verticals";

export function OnboardingWizard() {
  const [vertical, setVertical] = React.useState<ShopVertical | null>(null);
  const [state, formAction, pending] = useActionState<CreateShopState, FormData>(
    createShopFromWizard,
    {},
  );

  if (vertical === null) {
    return (
      <section aria-labelledby="onboarding-vertical-heading">
        <p className="text-xs text-muted-foreground">Step 1 of 2</p>
        <h1
          id="onboarding-vertical-heading"
          className="mt-2 text-2xl font-semibold tracking-tight"
        >
          What are you opening?
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          We&apos;ll set up a starter menu you can edit in place.
        </p>
        <div className="mt-6 flex flex-col gap-2">
          {VERTICAL_KEYS.map((key) => {
            const { label, description, icon: Icon } = VERTICALS[key];
            return (
              <button
                key={key}
                type="button"
                onClick={() => setVertical(key)}
                className="flex min-h-14 w-full items-center gap-3 rounded-lg border bg-card px-4 py-3 text-left transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <Icon className="size-5 shrink-0 text-muted-foreground" />
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="text-sm font-medium">{label}</span>
                  <span className="truncate text-xs text-muted-foreground">
                    {description}
                  </span>
                </span>
                <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
              </button>
            );
          })}
        </div>
      </section>
    );
  }

  const selected = VERTICALS[vertical];

  return (
    <section aria-labelledby="onboarding-name-heading">
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="-ml-2 text-muted-foreground"
        onClick={() => setVertical(null)}
        disabled={pending}
      >
        <ArrowLeft className="size-4" />
        {selected.label}
      </Button>
      <p className="mt-4 text-xs text-muted-foreground">Step 2 of 2</p>
      <h1
        id="onboarding-name-heading"
        className="mt-2 text-2xl font-semibold tracking-tight"
      >
        Name your shop
      </h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Customers see this name. You can change it anytime in the Studio.
      </p>
      <form action={formAction} className="mt-6 flex flex-col gap-4">
        <input type="hidden" name="vertical" value={vertical} />
        <div className="flex flex-col gap-2">
          <Label htmlFor="onboarding-shop-name">Shop name</Label>
          <Input
            id="onboarding-shop-name"
            name="name"
            placeholder="Чойхона №1"
            maxLength={80}
            required
            autoFocus
            autoComplete="organization"
            disabled={pending}
          />
        </div>
        {state.error ? (
          <p role="alert" className="text-sm text-destructive">
            {state.error}
          </p>
        ) : null}
        <Button type="submit" className="w-full" disabled={pending}>
          {pending ? (
            <>
              <Loader2 className="animate-spin" />
              Setting up your shop…
            </>
          ) : (
            "Create my shop"
          )}
        </Button>
      </form>
    </section>
  );
}
