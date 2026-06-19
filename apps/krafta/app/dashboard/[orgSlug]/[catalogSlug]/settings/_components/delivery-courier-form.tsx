"use client";

import * as React from "react";
import { CheckCircle2, Truck } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Spinner } from "@/components/ui/spinner";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { cn } from "@/lib/utils";
import {
  connectYandexDelivery,
  disconnectYandexDelivery,
  setYandexDeliveryActive,
} from "./delivery-courier-actions";

export type DeliveryCourierInitial = {
  /** An org-owned token is stored (the company connected its own account). */
  connected: boolean;
  accountLabel: string | null;
  isActive: boolean;
  /** No org token, but Krafta's dev/test env token is present. */
  usingEnvFallback: boolean;
};

export function DeliveryCourierForm({
  orgId,
  initial,
}: {
  orgId: string;
  initial: DeliveryCourierInitial;
}) {
  const [connected, setConnected] = React.useState(initial.connected);
  const [accountLabel, setAccountLabel] = React.useState(initial.accountLabel);
  const [isActive, setIsActive] = React.useState(initial.isActive);
  const [token, setToken] = React.useState("");
  const [label, setLabel] = React.useState("");
  const [statusMessage, setStatusMessage] = React.useState<string | null>(null);
  const [statusKind, setStatusKind] = React.useState<"ok" | "error">("ok");
  const [isPending, startTransition] = React.useTransition();

  const handleConnect = React.useCallback(() => {
    setStatusMessage(null);
    startTransition(async () => {
      const r = await connectYandexDelivery({ orgId, token, accountLabel: label });
      if (!r.ok) {
        setStatusKind("error");
        setStatusMessage(r.error);
        return;
      }
      setConnected(true);
      setAccountLabel(label.trim() || null);
      setIsActive(true);
      setToken("");
      setStatusKind("ok");
      setStatusMessage(`Connected · token ending ${r.last4}`);
    });
  }, [orgId, token, label]);

  const handleDisconnect = React.useCallback(() => {
    setStatusMessage(null);
    startTransition(async () => {
      const r = await disconnectYandexDelivery({ orgId });
      if (!r.ok) {
        setStatusKind("error");
        setStatusMessage(r.error);
        return;
      }
      setConnected(false);
      setAccountLabel(null);
      setStatusKind("ok");
      setStatusMessage("Disconnected.");
    });
  }, [orgId]);

  const handleToggleActive = React.useCallback(
    (next: boolean) => {
      setIsActive(next);
      startTransition(async () => {
        const r = await setYandexDeliveryActive({ orgId, isActive: next });
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
        <Truck className="mt-0.5 size-5 shrink-0 text-muted-foreground" />
        <div className="space-y-1">
          <h3 className="text-sm font-semibold">Delivery courier — Yandex Go</h3>
          <p className="text-sm text-muted-foreground">
            Connect your company&apos;s Yandex Delivery account to quote fees and
            dispatch couriers automatically. Each company uses its own account.
          </p>
        </div>
      </div>

      {connected ? (
        <div className="space-y-4">
          <div className="flex items-center gap-2 rounded-lg border bg-muted/40 p-3 text-sm">
            <CheckCircle2 className="size-4 shrink-0 text-foreground" />
            <span className="font-medium">
              {accountLabel || "Yandex Delivery connected"}
            </span>
          </div>
          <div className="flex items-center justify-between rounded-lg border p-4">
            <div className="space-y-0.5 pr-4">
              <FieldLabel>Courier dispatch active</FieldLabel>
              <FieldDescription>
                Pause without removing the connected account.
              </FieldDescription>
            </div>
            <Switch
              checked={isActive}
              onCheckedChange={handleToggleActive}
              disabled={isPending}
              aria-label="Courier dispatch active"
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
          {initial.usingEnvFallback ? (
            <div className="rounded-lg border border-dashed bg-muted/40 p-3 text-sm text-muted-foreground">
              Currently using Krafta&apos;s shared test token (dev). Connect your
              own account below to bill couriers to your company.
            </div>
          ) : null}
          <Field>
            <FieldLabel>Account name (optional)</FieldLabel>
            <Input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="e.g. My Cafe LLC"
            />
          </Field>
          <Field>
            <FieldLabel>Yandex Delivery API token</FieldLabel>
            <Input
              type="password"
              autoComplete="off"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder="OAuth token from your Yandex Delivery account"
            />
            <FieldDescription>
              From your Yandex Delivery corporate account → Integration. We
              validate it, then store it encrypted — it&apos;s never shown again.
            </FieldDescription>
          </Field>
          <Button
            type="button"
            onClick={handleConnect}
            disabled={isPending || !token.trim()}
          >
            {isPending ? (
              <>
                <Spinner className="size-4" />
                Connecting
              </>
            ) : (
              "Connect Yandex Delivery"
            )}
          </Button>
        </div>
      )}

      {statusMessage ? (
        <p
          className={cn(
            "text-sm",
            statusKind === "error"
              ? "text-destructive"
              : "text-muted-foreground",
          )}
        >
          {statusMessage}
        </p>
      ) : null}
    </div>
  );
}
