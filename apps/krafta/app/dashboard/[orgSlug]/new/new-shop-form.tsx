"use client";

import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createCodedShopAction, type NewShopState } from "./actions";

const initialState: NewShopState = { error: null };

export function NewShopForm({ orgSlug }: { orgSlug: string }) {
  const [state, formAction, pending] = useActionState(
    createCodedShopAction,
    initialState,
  );

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="orgSlug" value={orgSlug} />
      <div className="space-y-2">
        <label htmlFor="name" className="text-sm font-medium">
          Shop name
        </label>
        <Input
          id="name"
          name="name"
          placeholder="e.g. Aziz Coffee"
          maxLength={80}
          autoFocus
          required
        />
        <p className="text-xs text-muted-foreground">
          You can rename it later. The agent builds the shop in real code; you
          shape the look and pages by chatting with it.
        </p>
      </div>
      {state?.error ? (
        <p className="text-sm text-destructive">{state.error}</p>
      ) : null}
      <Button type="submit" disabled={pending}>
        {pending ? "Creating…" : "Create shop"}
      </Button>
    </form>
  );
}
