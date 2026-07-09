"use client";

import * as React from "react";
import { Check, Send } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "@/components/ui/field";
import { useT } from "@/lib/locales/dashboard/context";
import { cn } from "@/lib/utils";

import {
  generateConnectCode,
  refreshTelegramStatus,
  sendTelegramTest,
  setTelegramActive,
  disconnectTelegram,
} from "./notifications-actions";

export type TelegramInitial = {
  botUsername: string | null;
  chatConnected: boolean;
  chatTitle: string | null;
  isActive: boolean;
};

type Status = { kind: "ok" | "err"; msg: string } | null;
type Connect = { code: string; botUsername: string; deepLink: string } | null;

export function NotificationsForm({
  venueId,
  orgId,
  initial,
}: {
  venueId: string | null;
  orgId: string;
  initial: TelegramInitial | null;
}) {
  const t = useT();
  const [chatTitle, setChatTitle] = React.useState<string | null>(
    initial?.chatConnected
      ? (initial?.chatTitle ?? t("settings.notifications.chat_default"))
      : null,
  );
  const [isActive, setIsActive] = React.useState<boolean>(
    initial?.isActive ?? true,
  );
  const [connect, setConnect] = React.useState<Connect>(null);
  const [status, setStatus] = React.useState<Status>(null);
  const [pending, startTransition] = React.useTransition();

  const connected = Boolean(chatTitle);

  if (!venueId) {
    return (
      <FieldSet>
        <FieldLegend>{t("settings.notifications.legend")}</FieldLegend>
        <div className="mt-4 rounded-lg border border-dashed p-6 text-sm text-muted-foreground">
          {t("settings.notifications.no_venue")}
        </div>
      </FieldSet>
    );
  }

  const run = (fn: () => Promise<void>) => {
    setStatus(null);
    startTransition(fn);
  };

  const handleStartConnect = () =>
    run(async () => {
      const res = await generateConnectCode({ venueId, orgId });
      if (!res.ok) return setStatus({ kind: "err", msg: res.error });
      setConnect({
        code: res.code,
        botUsername: res.botUsername,
        deepLink: res.deepLink,
      });
    });

  const handleCheck = () =>
    run(async () => {
      const res = await refreshTelegramStatus({ venueId });
      if (!res.ok) return setStatus({ kind: "err", msg: res.error });
      if (res.chatConnected) {
        setChatTitle(res.chatTitle ?? t("settings.notifications.chat_default"));
        setIsActive(res.isActive);
        setConnect(null);
        setStatus({
          kind: "ok",
          msg: t("settings.notifications.chat_connected"),
        });
      } else {
        setStatus({
          kind: "err",
          msg: t("settings.notifications.not_connected_yet"),
        });
      }
    });

  const handleTest = () =>
    run(async () => {
      const res = await sendTelegramTest({ venueId });
      setStatus(
        res.ok
          ? { kind: "ok", msg: t("settings.notifications.test_sent") }
          : { kind: "err", msg: res.error },
      );
    });

  const handleToggle = (next: boolean) =>
    run(async () => {
      setIsActive(next);
      const res = await setTelegramActive({ venueId, isActive: next });
      if (!res.ok) {
        setIsActive(!next);
        setStatus({ kind: "err", msg: res.error });
      }
    });

  const handleDisconnect = () =>
    run(async () => {
      const res = await disconnectTelegram({ venueId });
      if (!res.ok) return setStatus({ kind: "err", msg: res.error });
      setChatTitle(null);
      setConnect(null);
      setIsActive(true);
      setStatus({
        kind: "ok",
        msg: t("settings.notifications.chat_disconnected"),
      });
    });

  return (
    <FieldSet>
      <FieldLegend>{t("settings.notifications.legend")}</FieldLegend>
      <FieldDescription>
        {t("settings.notifications.description")}
      </FieldDescription>

      <FieldGroup className="mt-6 gap-6">
        {connected ? (
          // ── Connected ──────────────────────────────────────────────
          <>
            <Field>
              <FieldLabel>{t("settings.notifications.order_chat_label")}</FieldLabel>
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="secondary" className="gap-1">
                  <Check className="size-3" />
                  {chatTitle}
                </Badge>
                <span className="text-sm text-muted-foreground">
                  {t("settings.notifications.receives_every_order")}
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="ml-auto text-muted-foreground"
                  onClick={handleDisconnect}
                  disabled={pending}
                >
                  {t("settings.disconnect")}
                </Button>
              </div>
            </Field>

            <Field orientation="horizontal">
              <Switch
                id="tg-active"
                checked={isActive}
                onCheckedChange={handleToggle}
                disabled={pending}
              />
              <FieldLabel htmlFor="tg-active" className="cursor-pointer">
                {t("settings.notifications.send_alerts_label")}
              </FieldLabel>
            </Field>

            <Field>
              <Button
                type="button"
                variant="outline"
                onClick={handleTest}
                disabled={pending}
                className="w-fit"
              >
                {pending ? (
                  <Spinner className="size-4" />
                ) : (
                  <Send className="size-4" />
                )}
                {t("settings.notifications.send_test")}
              </Button>
            </Field>
          </>
        ) : !connect ? (
          // ── Not connected, no code yet ─────────────────────────────
          <Field>
            <Button
              type="button"
              onClick={handleStartConnect}
              disabled={pending}
              className="w-fit"
            >
              {pending ? (
                <Spinner className="size-4" />
              ) : (
                t("settings.notifications.connect_cta")
              )}
            </Button>
            <FieldDescription>
              {t("settings.notifications.connect_hint")}
            </FieldDescription>
          </Field>
        ) : (
          // ── Code minted — pick who receives the orders ────────────
          <>
            <FieldDescription>
              {t("settings.notifications.pick_destination")}
            </FieldDescription>

            <Field>
              <FieldLabel>{t("settings.notifications.team_label")}</FieldLabel>
              <FieldDescription>
                {t("settings.notifications.team_add_pre")}{" "}
                <span className="font-mono">@{connect.botUsername}</span>
                {t("settings.notifications.team_add_post")}
              </FieldDescription>
              <code className="mt-1 inline-block w-fit rounded-md border bg-muted px-3 py-1.5 font-mono text-sm">
                /connect {connect.code}
              </code>
              <FieldDescription>
                {t("settings.notifications.team_hint")}
              </FieldDescription>
            </Field>

            <Field>
              <FieldLabel>{t("settings.notifications.self_label")}</FieldLabel>
              <Button asChild className="w-fit">
                <a
                  href={connect.deepLink}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {t("settings.notifications.open_in_telegram", {
                    bot: connect.botUsername,
                  })}
                </a>
              </Button>
              <FieldDescription>
                {t("settings.notifications.self_hint_pre")} <b>Start</b>
                {t("settings.notifications.self_hint_post")}
              </FieldDescription>
            </Field>

            <Field>
              <Button
                type="button"
                variant="outline"
                onClick={handleCheck}
                disabled={pending}
                className="w-fit"
              >
                {pending ? (
                  <Spinner className="size-4" />
                ) : (
                  t("settings.notifications.check_cta")
                )}
              </Button>
              <FieldDescription>
                {t("settings.notifications.code_expires")}
              </FieldDescription>
            </Field>
          </>
        )}
      </FieldGroup>

      {status ? (
        <p
          className={cn(
            "mt-4 text-sm",
            status.kind === "err"
              ? "text-destructive"
              : "text-muted-foreground",
          )}
        >
          {status.msg}
        </p>
      ) : null}
    </FieldSet>
  );
}
