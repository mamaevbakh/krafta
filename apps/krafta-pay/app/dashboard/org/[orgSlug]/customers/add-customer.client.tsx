"use client";

import { useState } from "react";
import { ChevronRight, Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useT } from "@/lib/locales/context";

export type NewCustomer = {
  id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  external_id: string | null;
  environment: string | null;
  /** A one-off payer grouped read-only, in Stripe's sense — not someone you can bill. */
  is_guest?: boolean | null;
  created_at: string | null;
  subscription_count: number;
  active_count: number;
  attention_count: number;
  mrr_minor: number | null;
  mrr_currency: string | null;
};

/**
 * Write down a customer the merchant already has.
 *
 * Before this, the only way a customer came into existence was a payment. That
 * is backwards for how the business actually runs here: a language school signs
 * a student up in the room, agrees the price, and collects on Friday. For those
 * four days the student existed on paper and nowhere else, so the merchant kept
 * their real list in a notebook and Krafta Pay held a partial copy.
 *
 * NAME IS THE ONLY REQUIRED FIELD, and it is the first thing asked. Email and
 * phone are how you *reach* someone; the name is how you *recognise* them, and
 * recognition is the entire job of the Customers page.
 *
 * The merchant's own id is behind a disclosure. It matters enormously to the
 * one merchant wiring up an API and not at all to the twenty who are typing in
 * the people they already know — putting it in the main body would make a
 * one-field task look like a four-field form.
 */
export function AddCustomer({
  orgSlug,
  environment,
  onAdded,
}: {
  orgSlug: string;
  environment: string;
  onAdded: (customer: NewCustomer) => void;
}) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [externalId, setExternalId] = useState("");
  const [showOwnId, setShowOwnId] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setName("");
    setEmail("");
    setPhone("");
    setExternalId("");
    setShowOwnId(false);
    setError(null);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (saving) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/dashboard/customers?orgSlug=${encodeURIComponent(orgSlug)}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name, email, phone, externalId }),
        },
      );
      const json = (await res.json().catch(() => null)) as
        | { customer?: NewCustomer; error?: string }
        | null;

      if (!res.ok || !json?.customer) {
        // Named causes get named copy. "Could not add the customer" for a
        // reused id would leave the merchant retyping a form that will fail
        // again in exactly the same way.
        const code = json?.error;
        setError(
          code === "duplicate_external_id"
            ? t("customers.add.errorDuplicate")
            : code === "name_required"
              ? t("customers.add.errorName")
              : code === "email_invalid"
                ? t("customers.add.errorEmail")
                : t("customers.add.errorGeneric"),
        );
        // Never point at a field the merchant cannot see. The id lives behind a
        // disclosure, and it is the one thing they have to change.
        if (code === "duplicate_external_id") setShowOwnId(true);
        return;
      }

      onAdded(json.customer);
      reset();
      setOpen(false);
    } catch {
      setError(t("customers.add.errorGeneric"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}>
        <Plus className="size-4" aria-hidden />
        {t("customers.add")}
      </Button>

      <Dialog
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          // Cleared on close rather than on open, so a merchant who cancels
          // mid-typing does not find their half-filled form waiting for them
          // the next time they add somebody else.
          if (!next) reset();
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("customers.add.title")}</DialogTitle>
            <DialogDescription>{t("customers.add.description")}</DialogDescription>
          </DialogHeader>

          <form onSubmit={submit} className="space-y-4">
            <div className="grid gap-1.5">
              <Label htmlFor="new-customer-name">{t("customers.add.name")}</Label>
              <Input
                id="new-customer-name"
                autoFocus
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={t("customer.name.placeholder")}
                maxLength={200}
                required
              />
              <p className="text-xs text-muted-foreground">{t("customer.name.hint")}</p>
            </div>

            <div className="grid gap-1.5">
              <Label htmlFor="new-customer-email">{t("customers.add.email")}</Label>
              <Input
                id="new-customer-email"
                type="email"
                inputMode="email"
                autoComplete="off"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="student@example.com"
              />
            </div>

            <div className="grid gap-1.5">
              <Label htmlFor="new-customer-phone">{t("customers.add.phone")}</Label>
              <Input
                id="new-customer-phone"
                type="tel"
                inputMode="tel"
                autoComplete="off"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+998 90 123 45 67"
              />
            </div>

            <details
              className="group"
              open={showOwnId}
              onToggle={(e) => setShowOwnId(e.currentTarget.open)}
            >
              <summary className="inline-flex cursor-pointer list-none items-center gap-1 text-sm text-muted-foreground transition-colors marker:content-none hover:text-foreground">
                <ChevronRight
                  className="size-3.5 transition-transform group-open:rotate-90"
                  aria-hidden
                />
                {t("customers.add.externalId")}
              </summary>
              <div className="mt-3 space-y-1.5 border-l pl-4">
                <Label htmlFor="new-customer-external-id" className="sr-only">
                  {t("customers.add.externalId")}
                </Label>
                <Input
                  id="new-customer-external-id"
                  value={externalId}
                  onChange={(e) => setExternalId(e.target.value)}
                  className="font-mono text-xs"
                  autoComplete="off"
                  maxLength={200}
                />
                <p className="text-xs text-muted-foreground">
                  {t("customers.add.externalIdHint")}
                </p>
              </div>
            </details>

            {/* Test and live customers are separate records, and the list the
                merchant is looking at shows one mode. Saying which one this
                lands in is cheaper than explaining afterwards why the new row
                never appeared. */}
            {environment === "test" ? (
              <p className="text-xs text-muted-foreground">{t("customers.add.testMode")}</p>
            ) : null}

            {error ? <p className="text-sm text-destructive">{error}</p> : null}

            <DialogFooter>
              <DialogClose render={<Button type="button" variant="outline" />}>
                {t("customer.name.cancel")}
              </DialogClose>
              <Button type="submit" disabled={saving || name.trim().length === 0}>
                {saving ? t("customers.add.saving") : t("customers.add.submit")}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
