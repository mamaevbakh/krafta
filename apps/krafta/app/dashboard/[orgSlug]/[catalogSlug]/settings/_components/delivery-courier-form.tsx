"use client";

import * as React from "react";
import { CheckCircle2, Truck } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Spinner } from "@/components/ui/spinner";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { useT } from "@/lib/locales/dashboard/context";
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
  const t = useT();
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
      setStatusMessage(
        t("settings.courier.connected_last4", { last4: r.last4 }),
      );
    });
  }, [orgId, token, label, t]);

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
      setStatusMessage(t("settings.courier.disconnected"));
    });
  }, [orgId, t]);

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
          <h3 className="text-sm font-semibold">{t("settings.courier.title")}</h3>
          <p className="text-sm text-muted-foreground">
            {t("settings.courier.description")}
          </p>
        </div>
      </div>

      {connected ? (
        <div className="space-y-4">
          <div className="flex items-center gap-2 rounded-lg border bg-muted/40 p-3 text-sm">
            <CheckCircle2 className="size-4 shrink-0 text-foreground" />
            <span className="font-medium">
              {accountLabel || t("settings.courier.connected_fallback")}
            </span>
          </div>
          <div className="flex items-center justify-between rounded-lg border p-4">
            <div className="space-y-0.5 pr-4">
              <FieldLabel>
                {t("settings.courier.dispatch_active_label")}
              </FieldLabel>
              <FieldDescription>{t("settings.pause_hint")}</FieldDescription>
            </div>
            <Switch
              checked={isActive}
              onCheckedChange={handleToggleActive}
              disabled={isPending}
              aria-label={t("settings.courier.dispatch_active_label")}
            />
          </div>
          <Button
            type="button"
            variant="ghost"
            className="text-destructive hover:text-destructive"
            onClick={handleDisconnect}
            disabled={isPending}
          >
            {t("settings.disconnect")}
          </Button>
        </div>
      ) : (
        <div className="space-y-4">
          {initial.usingEnvFallback ? (
            <div className="rounded-lg border border-dashed bg-muted/40 p-3 text-sm text-muted-foreground">
              {t("settings.courier.env_fallback")}
            </div>
          ) : null}
          <Field>
            <FieldLabel>{t("settings.account_name_optional")}</FieldLabel>
            <Input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder={t("settings.account_name_placeholder")}
            />
          </Field>
          <Field>
            <FieldLabel>{t("settings.courier.token_label")}</FieldLabel>
            <Input
              type="password"
              autoComplete="off"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder={t("settings.courier.token_placeholder")}
            />
            <FieldDescription>
              {t("settings.courier.token_hint")}
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
                {t("settings.connecting")}
              </>
            ) : (
              t("settings.courier.connect_cta")
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
