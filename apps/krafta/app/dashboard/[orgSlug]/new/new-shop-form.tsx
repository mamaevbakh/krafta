"use client";

import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useT } from "@/lib/locales/dashboard/context";
import { createCodedShopAction, type NewShopState } from "./actions";

const initialState: NewShopState = { error: null };

export function NewShopForm({ orgSlug }: { orgSlug: string }) {
  const t = useT();
  const [state, formAction, pending] = useActionState(
    createCodedShopAction,
    initialState,
  );

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="orgSlug" value={orgSlug} />
      <div className="space-y-2">
        <label htmlFor="name" className="text-sm font-medium">
          {t("home.shop_name_label")}
        </label>
        <Input
          id="name"
          name="name"
          placeholder={t("home.shop_name_placeholder")}
          maxLength={80}
          autoFocus
          required
        />
        <p className="text-xs text-muted-foreground">
          {t("home.shop_name_hint")}
        </p>
      </div>
      {state?.error ? (
        <p className="text-sm text-destructive">{state.error}</p>
      ) : null}
      <Button type="submit" disabled={pending}>
        {pending ? t("common.creating") : t("home.create_shop")}
      </Button>
    </form>
  );
}
