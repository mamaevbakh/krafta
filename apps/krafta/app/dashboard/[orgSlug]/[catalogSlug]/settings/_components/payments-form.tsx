"use client";

import * as React from "react";
import { CheckCircle2, CreditCard, TriangleAlert } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Spinner } from "@/components/ui/spinner";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { cn } from "@/lib/utils";
import {
  connectAtmosPayments,
  disconnectAtmosPayments,
  setAtmosPaymentsActive,
} from "./payments-actions";

export type PaymentsInitial = {
  /** The org has connected a Krafta Pay (Atmos) account. */
  connected: boolean;
  isActive: boolean;
  accountLabel: string | null;
  storeId: string | null;
  /** Atmos confirmed the credentials at connect time (vs saved optimistically). */
  verified: boolean;
};

export function PaymentsForm({
  orgId,
  initial,
}: {
  orgId: string;
  initial: PaymentsInitial;
}) {
  const [connected, setConnected] = React.useState(initial.connected);
  const [isActive, setIsActive] = React.useState(initial.isActive);
  const [accountLabel, setAccountLabel] = React.useState(initial.accountLabel);
  const [storeIdShown, setStoreIdShown] = React.useState(initial.storeId);
  const [verified, setVerified] = React.useState(initial.verified);

  const [storeId, setStoreId] = React.useState("");
  const [consumerKey, setConsumerKey] = React.useState("");
  const [consumerSecret, setConsumerSecret] = React.useState("");
  const [label, setLabel] = React.useState("");
  const [statusMessage, setStatusMessage] = React.useState<string | null>(null);
  const [statusKind, setStatusKind] = React.useState<"ok" | "error">("ok");
  const [isPending, startTransition] = React.useTransition();

  const handleConnect = React.useCallback(() => {
    setStatusMessage(null);
    startTransition(async () => {
      const r = await connectAtmosPayments({
        orgId,
        storeId,
        consumerKey,
        consumerSecret,
        accountLabel: label,
      });
      if (!r.ok) {
        setStatusKind("error");
        setStatusMessage(r.error);
        return;
      }
      setConnected(true);
      setIsActive(true);
      setAccountLabel(label.trim() || null);
      setStoreIdShown(r.storeId);
      setVerified(r.verified);
      setStoreId("");
      setConsumerKey("");
      setConsumerSecret("");
      setStatusKind("ok");
      setStatusMessage(
        r.verified
          ? "Connected — customers can now pay by card."
          : "Saved. We couldn't reach Atmos to verify from here; the first real payment will confirm it.",
      );
    });
  }, [orgId, storeId, consumerKey, consumerSecret, label]);

  const handleDisconnect = React.useCallback(() => {
    setStatusMessage(null);
    startTransition(async () => {
      const r = await disconnectAtmosPayments({ orgId });
      if (!r.ok) {
        setStatusKind("error");
        setStatusMessage(r.error);
        return;
      }
      setConnected(false);
      setIsActive(false);
      setAccountLabel(null);
      setStoreIdShown(null);
      setStatusKind("ok");
      setStatusMessage("Disconnected. Card checkout is turned off.");
    });
  }, [orgId]);

  const handleToggleActive = React.useCallback(
    (next: boolean) => {
      setIsActive(next);
      startTransition(async () => {
        const r = await setAtmosPaymentsActive({ orgId, isActive: next });
        if (!r.ok) {
          setIsActive(!next);
          setStatusKind("error");
          setStatusMessage(r.error);
        }
      });
    },
    [orgId],
  );

  return (
    <div className="space-y-5 rounded-xl border border-border bg-card p-6">
      <div className="flex items-start gap-3">
        <CreditCard className="mt-0.5 size-5 shrink-0 text-muted-foreground" />
        <div className="space-y-1">
          <h3 className="text-sm font-semibold">Card payments — Krafta Pay (Atmos)</h3>
          <p className="text-sm text-muted-foreground">
            Connect your company&apos;s Atmos account so customers can pay by card
            at checkout instead of cash only. Payments settle to your own Atmos
            account. Each company uses its own credentials.
          </p>
        </div>
      </div>

      {connected ? (
        <div className="space-y-4">
          <div className="flex items-center gap-2 rounded-lg border bg-muted/40 p-3 text-sm">
            <CheckCircle2 className="size-4 shrink-0 text-foreground" />
            <span className="font-medium">
              {accountLabel || "Krafta Pay connected"}
              {storeIdShown ? (
                <span className="ml-1 font-mono text-xs text-muted-foreground">
                  · store {storeIdShown}
                </span>
              ) : null}
            </span>
          </div>

          {!verified ? (
            <div className="flex items-start gap-2 rounded-lg border border-dashed bg-muted/40 p-3 text-sm text-muted-foreground">
              <TriangleAlert className="mt-0.5 size-4 shrink-0" />
              <span>
                Saved, but we couldn&apos;t reach Atmos to verify the credentials
                from here. The first real card payment will confirm them.
              </span>
            </div>
          ) : null}

          <div className="flex items-center justify-between rounded-lg border p-4">
            <div className="space-y-0.5 pr-4">
              <FieldLabel>Card checkout active</FieldLabel>
              <FieldDescription>
                Pause without removing the connected account.
              </FieldDescription>
            </div>
            <Switch
              checked={isActive}
              onCheckedChange={handleToggleActive}
              disabled={isPending}
              aria-label="Card checkout active"
            />
          </div>
          <Button
            type="button"
            variant="ghost"
            className="text-destructive hover:text-destructive"
            onClick={handleDisconnect}
            disabled={isPending}
          >
            Disconnect
          </Button>
        </div>
      ) : (
        <div className="space-y-4">
          <Field>
            <FieldLabel>Account name (optional)</FieldLabel>
            <Input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="e.g. My Cafe LLC"
            />
          </Field>
          <Field>
            <FieldLabel>Atmos store ID</FieldLabel>
            <Input
              inputMode="numeric"
              autoComplete="off"
              value={storeId}
              onChange={(e) => setStoreId(e.target.value)}
              placeholder="e.g. 1234"
            />
          </Field>
          <Field>
            <FieldLabel>Consumer key</FieldLabel>
            <Input
              type="password"
              autoComplete="off"
              value={consumerKey}
              onChange={(e) => setConsumerKey(e.target.value)}
              placeholder="Atmos consumer key"
            />
          </Field>
          <Field>
            <FieldLabel>Consumer secret</FieldLabel>
            <Input
              type="password"
              autoComplete="off"
              value={consumerSecret}
              onChange={(e) => setConsumerSecret(e.target.value)}
              placeholder="Atmos consumer secret"
            />
            <FieldDescription>
              From your Atmos merchant account. We validate them, then store them
              encrypted in Krafta Pay — they&apos;re never shown again.
            </FieldDescription>
          </Field>
          <Button
            type="button"
            onClick={handleConnect}
            disabled={
              isPending ||
              !storeId.trim() ||
              !consumerKey.trim() ||
              !consumerSecret.trim()
            }
          >
            {isPending ? (
              <>
                <Spinner className="size-4" />
                Connecting
              </>
            ) : (
              "Connect Krafta Pay"
            )}
          </Button>
        </div>
      )}

      {statusMessage ? (
        <p
          className={cn(
            "text-sm",
            statusKind === "error" ? "text-destructive" : "text-muted-foreground",
          )}
        >
          {statusMessage}
        </p>
      ) : null}
    </div>
  );
}
