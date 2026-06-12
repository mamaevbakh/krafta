"use client";

import { useMemo, useState } from "react";
import { CreditCardIcon, CheckIcon } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import {
  Field,
  FieldLabel,
  FieldError,
} from "@/components/ui/field";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@/components/ui/input-group";
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSlot,
} from "@/components/ui/input-otp";

// UZS amounts are stored in minor units (tiyin; 1 UZS = 100 tiyin). Render as
// whole sums with comma thousands separators, no decimals — per DESIGN.md.
function formatUzs(amountMinor: number, currency: string) {
  const sum = Math.round((amountMinor ?? 0) / 100);
  return `${sum.toLocaleString("en-US")} ${currency}`;
}

function formatCardNumber(raw: string) {
  return raw
    .replace(/\D/g, "")
    .slice(0, 16)
    .replace(/(.{4})/g, "$1 ")
    .trim();
}

function formatExpiry(raw: string) {
  const d = raw.replace(/\D/g, "").slice(0, 4);
  return d.length <= 2 ? d : `${d.slice(0, 2)}/${d.slice(2)}`;
}

type Step = "card" | "otp" | "success";

// Injection seam so the hosted page wires the real /atmos endpoints while a
// preview/test can supply canned responses. Defaults to real fetch calls.
export type AtmosClient = {
  preApply: (input: {
    cardNumber: string;
    expiry: string;
  }) => Promise<{ ok: boolean; maskedPhone?: string | null; error?: string }>;
  apply: (input: {
    otp: string;
  }) => Promise<{ ok: boolean; status?: string; error?: string }>;
};

export function AtmosCardForm({
  publicToken,
  amountMinor,
  currency,
  client,
  initialStep = "card",
  initialMaskedPhone = null,
}: {
  publicToken: string;
  amountMinor: number;
  currency: string;
  client?: AtmosClient;
  // Starting step — lets a host mount at the OTP step on resume, or a preview
  // render each state. Defaults to the card-entry step.
  initialStep?: Step;
  initialMaskedPhone?: string | null;
}) {
  const amountLabel = useMemo(
    () => formatUzs(amountMinor, currency),
    [amountMinor, currency],
  );

  const resolvedClient = useMemo<AtmosClient>(
    () =>
      client ?? {
        async preApply({ cardNumber, expiry }) {
          const res = await fetch(
            `/api/checkout_sessions/${encodeURIComponent(publicToken)}/atmos/pre-apply`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ cardNumber, expiry }),
            },
          );
          const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
          if (!res.ok || json.error) {
            return { ok: false, error: String(json.error ?? `http_${res.status}`) };
          }
          return { ok: true, maskedPhone: (json.phone as string) ?? null };
        },
        async apply({ otp }) {
          const res = await fetch(
            `/api/checkout_sessions/${encodeURIComponent(publicToken)}/atmos/apply`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ otp }),
            },
          );
          const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
          if (!res.ok || json.error) {
            return { ok: false, error: String(json.error ?? `http_${res.status}`) };
          }
          return { ok: true, status: (json.status as string) ?? "succeeded" };
        },
      },
    [client, publicToken],
  );

  const [step, setStep] = useState<Step>(initialStep);
  const [cardNumber, setCardNumber] = useState("");
  const [expiry, setExpiry] = useState("");
  const [otp, setOtp] = useState("");
  const [maskedPhone, setMaskedPhone] = useState<string | null>(initialMaskedPhone);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cardDigits = cardNumber.replace(/\D/g, "");
  const expiryDigits = expiry.replace(/\D/g, "");
  const cardValid = cardDigits.length === 16 && expiryDigits.length === 4;

  async function handlePreApply(e: React.FormEvent) {
    e.preventDefault();
    if (!cardValid || pending) return;
    setPending(true);
    setError(null);
    const result = await resolvedClient
      .preApply({ cardNumber: cardDigits, expiry: expiryDigits })
      .catch(() => ({ ok: false, error: "network_error" }) as const);
    setPending(false);
    if (!result.ok) {
      setError(errorMessage(result.error));
      return;
    }
    setMaskedPhone(result.maskedPhone ?? null);
    setOtp("");
    setStep("otp");
  }

  async function handleApply(e: React.FormEvent) {
    e.preventDefault();
    if (otp.length < 6 || pending) return;
    setPending(true);
    setError(null);
    const result = await resolvedClient
      .apply({ otp })
      .catch(() => ({ ok: false, error: "network_error" }) as const);
    setPending(false);
    if (!result.ok) {
      setError(errorMessage(result.error));
      return;
    }
    setStep("success");
  }

  if (step === "success") {
    return (
      <div className="flex flex-col items-center gap-3 py-8 text-center">
        <div className="flex size-12 items-center justify-center rounded-full bg-muted">
          <CheckIcon className="size-6 text-foreground" />
        </div>
        <div className="space-y-1">
          <div className="text-base font-semibold">Payment successful</div>
          <p className="text-sm text-muted-foreground">
            Your subscription is active. Taking you back…
          </p>
        </div>
        <Spinner className="text-muted-foreground" />
      </div>
    );
  }

  if (step === "otp") {
    return (
      <form onSubmit={handleApply} className="space-y-4">
        <div className="space-y-1">
          <div className="text-sm font-medium">Enter the code</div>
          <p className="text-sm text-muted-foreground">
            We sent a 6-digit code to the cardholder&apos;s phone
            {maskedPhone ? (
              <span className="font-mono tabular-nums"> {maskedPhone}</span>
            ) : null}
            .
          </p>
        </div>

        <InputOTP
          maxLength={6}
          value={otp}
          onChange={(v) => setOtp(v.replace(/\D/g, ""))}
          inputMode="numeric"
          autoFocus
          containerClassName="justify-center sm:justify-start"
        >
          <InputOTPGroup>
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <InputOTPSlot
                key={i}
                index={i}
                className="size-11 text-base font-mono tabular-nums"
              />
            ))}
          </InputOTPGroup>
        </InputOTP>

        {error ? <FieldError>{error}</FieldError> : null}

        <Button type="submit" className="h-11 w-full" disabled={pending || otp.length < 6}>
          {pending ? <Spinner /> : null}
          {pending ? "Confirming…" : `Pay ${amountLabel}`}
        </Button>

        <div className="flex items-center justify-between text-sm">
          <button
            type="button"
            className="text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50"
            onClick={() => {
              setError(null);
              setStep("card");
            }}
            disabled={pending}
          >
            Use a different card
          </button>
        </div>
      </form>
    );
  }

  return (
    <form onSubmit={handlePreApply} className="space-y-4">
      <Field>
        <FieldLabel htmlFor="atmos-card-number">Card number</FieldLabel>
        <InputGroup className="h-11">
          <InputGroupAddon>
            <CreditCardIcon />
          </InputGroupAddon>
          <InputGroupInput
            id="atmos-card-number"
            inputMode="numeric"
            autoComplete="cc-number"
            placeholder="8600 0000 0000 0000"
            className="font-mono tabular-nums tracking-wide"
            value={cardNumber}
            onChange={(e) => setCardNumber(formatCardNumber(e.target.value))}
          />
        </InputGroup>
      </Field>

      <Field>
        <FieldLabel htmlFor="atmos-card-expiry">Expiry date</FieldLabel>
        <Input
          id="atmos-card-expiry"
          inputMode="numeric"
          autoComplete="cc-exp"
          placeholder="MM/YY"
          className="h-11 w-28 font-mono tabular-nums"
          value={expiry}
          onChange={(e) => setExpiry(formatExpiry(e.target.value))}
        />
      </Field>

      <p className="text-xs text-muted-foreground">
        You&apos;ll get one SMS code to confirm. Your card is securely saved for
        future renewals.
      </p>

      {error ? <FieldError>{error}</FieldError> : null}

      <Button type="submit" className="h-11 w-full" disabled={!cardValid || pending}>
        {pending ? <Spinner /> : null}
        {pending ? "Sending code…" : `Pay ${amountLabel}`}
      </Button>
    </form>
  );
}

// Map provider/transport error codes to concrete, actionable copy (DESIGN.md:
// "Generic 'Invalid input' violates this system").
function errorMessage(code?: string) {
  switch (code) {
    case "network_error":
      return "Connection problem. Check your internet and try again.";
    case "atmos_card_invalid":
    case "invalid_card":
      return "That card number or expiry doesn't look right. Please re-check it.";
    case "atmos_otp_invalid":
    case "invalid_otp":
      return "That code didn't match. Re-enter the code from the SMS.";
    case "atmos_insufficient_funds":
      return "The payment was declined for insufficient funds.";
    default:
      return "We couldn't complete the payment. Please try again.";
  }
}
