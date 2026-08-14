"use client";

import { useRef, useState } from "react";

import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { useT } from "@/lib/locales/context";

/**
 * "Who is paying?" — asked once, of a customer we cannot yet name.
 *
 * Krafta Pay's checkout has only ever asked for a card. That is why production
 * holds 35 customers, 24 email addresses, zero names and zero phone numbers:
 * the merchant's Customers page is a list of people they cannot recognise, and
 * there is no historical data to recover. A merchant who wants to remind a
 * parent that tuition is due has nothing to remind them with.
 *
 * THREE RULES, ALL ABOUT NOT COSTING A PAYMENT.
 *
 * Optional. Nothing here gates the card form, nothing validates, nothing turns
 * red. A customer who ignores it pays exactly as they did before. Two required
 * fields in front of a 250,000 UZS charge would buy names at the price of
 * revenue, which is a bad trade for the merchant we are supposedly helping.
 *
 * Saved on blur, fire-and-forget. No button, because a second button beside
 * "Pay" is a fork in a screen that should have one action; and no error
 * surface, because a failure here loses a name, not money. The payer is never
 * told about a problem that is ours.
 *
 * Shown only when we do not already know. If the merchant created this link
 * from the customer's own page they already typed the name, and asking someone
 * to re-identify themselves reads as a system that was not paying attention.
 */
export function PayerDetails({ publicToken }: { publicToken: string }) {
  const t = useT();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  // What the server already has, so a blur that changed nothing does not
  // re-post on every focus change.
  const saved = useRef({ name: "", phone: "" });

  function save() {
    const next = { name: name.trim(), phone: phone.trim() };
    if (next.name === saved.current.name && next.phone === saved.current.phone) return;
    if (!next.name && !next.phone) return;
    saved.current = next;
    void fetch(`/api/checkout_sessions/${encodeURIComponent(publicToken)}/payer`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(next),
      // The payer may well submit the card a moment later and navigate away.
      // keepalive lets the request finish rather than being cancelled with the
      // page, which is the difference between capturing a name and not.
      keepalive: true,
    }).catch(() => {
      // See the note above: never surfaced.
    });
  }

  return (
    <section className="space-y-3">
      <div>
        <h2 className="text-sm font-medium">{t("checkout.payer.heading")}</h2>
        <p className="mt-1 text-xs text-muted-foreground">{t("checkout.payer.hint")}</p>
      </div>

      <Field>
        <FieldLabel htmlFor="payer-name">{t("checkout.payer.name")}</FieldLabel>
        <Input
          id="payer-name"
          autoComplete="name"
          className="h-11"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={save}
          maxLength={200}
        />
      </Field>

      <Field>
        <FieldLabel htmlFor="payer-phone">{t("checkout.payer.phone")}</FieldLabel>
        <Input
          id="payer-phone"
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          placeholder="+998 90 123 45 67"
          className="h-11"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          onBlur={save}
          maxLength={40}
        />
      </Field>
    </section>
  );
}
