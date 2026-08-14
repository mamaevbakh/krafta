"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Pencil, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useT } from "@/lib/locales/context";

/**
 * The customer's name, edited in place by the merchant.
 *
 * The name is the merchant's label for their own customer, not something the
 * payer supplies — nobody paying for a language class types «мама Алишера»
 * about themselves. So this is the only place it can be set, and it has to be
 * reachable in one click from the page where the merchant is already standing.
 *
 * Falls back to email, then phone, so a customer who has never been named
 * still reads as something rather than an empty heading.
 */
export function CustomerName({
  customerId,
  orgSlug,
  initialName,
  fallback,
}: {
  customerId: string;
  orgSlug: string;
  initialName: string | null;
  fallback: string;
}) {
  const t = useT();
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(initialName ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/dashboard/customers/${customerId}?orgSlug=${encodeURIComponent(orgSlug)}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: value }),
        },
      );
      if (!res.ok) {
        setError(t("customer.name.saveFailed"));
        return;
      }
      setEditing(false);
      // The name appears in the heading here and in the list behind it, so the
      // server data has to be refreshed rather than just this component's state.
      router.refresh();
    } catch {
      setError(t("customer.name.saveFailed"));
    } finally {
      setSaving(false);
    }
  }

  if (!editing) {
    return (
      <div className="flex items-center gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">
          {initialName ?? fallback}
        </h1>
        <Button
          variant="ghost"
          size="icon"
          className="size-8 text-muted-foreground"
          onClick={() => setEditing(true)}
          aria-label={t("customer.name.edit")}
        >
          <Pencil className="size-4" aria-hidden />
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-2">
        <Input
          autoFocus
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void save();
            if (e.key === "Escape") setEditing(false);
          }}
          placeholder={t("customer.name.placeholder")}
          className="h-9 max-w-xs"
          maxLength={200}
        />
        <Button size="icon" className="size-9" onClick={() => void save()} disabled={saving}>
          <Check className="size-4" aria-hidden />
          <span className="sr-only">{t("customer.name.save")}</span>
        </Button>
        <Button
          variant="outline"
          size="icon"
          className="size-9"
          onClick={() => {
            setValue(initialName ?? "");
            setEditing(false);
          }}
          disabled={saving}
        >
          <X className="size-4" aria-hidden />
          <span className="sr-only">{t("customer.name.cancel")}</span>
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">{t("customer.name.hint")}</p>
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
    </div>
  );
}
