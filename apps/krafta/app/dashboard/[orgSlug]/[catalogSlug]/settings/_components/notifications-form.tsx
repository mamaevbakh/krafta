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
  const [chatTitle, setChatTitle] = React.useState<string | null>(
    initial?.chatConnected ? (initial?.chatTitle ?? "Чат") : null,
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
        <FieldLegend>Notifications</FieldLegend>
        <div className="mt-4 rounded-lg border border-dashed p-6 text-sm text-muted-foreground">
          Venue row not found for this catalog. Notifications need a venue.
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
        setChatTitle(res.chatTitle ?? "Чат");
        setIsActive(res.isActive);
        setConnect(null);
        setStatus({ kind: "ok", msg: "Чат подключён." });
      } else {
        setStatus({
          kind: "err",
          msg: "Пока не вижу подключения. Отправьте код боту и попробуйте снова.",
        });
      }
    });

  const handleTest = () =>
    run(async () => {
      const res = await sendTelegramTest({ venueId });
      setStatus(
        res.ok
          ? { kind: "ok", msg: "Тестовое сообщение отправлено." }
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
      setStatus({ kind: "ok", msg: "Чат отключён." });
    });

  return (
    <FieldSet>
      <FieldLegend>Notifications</FieldLegend>
      <FieldDescription>
        Get a Telegram message the moment a customer places an order.
      </FieldDescription>

      <FieldGroup className="mt-6 gap-6">
        {connected ? (
          // ── Connected ──────────────────────────────────────────────
          <>
            <Field>
              <FieldLabel>Order chat</FieldLabel>
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="secondary" className="gap-1">
                  <Check className="size-3" />
                  {chatTitle}
                </Badge>
                <span className="text-sm text-muted-foreground">
                  receives every order
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="ml-auto text-muted-foreground"
                  onClick={handleDisconnect}
                  disabled={pending}
                >
                  Disconnect
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
                Send order alerts
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
                Send test message
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
              {pending ? <Spinner className="size-4" /> : "Connect order alerts"}
            </Button>
            <FieldDescription>
              Connect a private Telegram chat or a team group. You and your
              staff get every order instantly — customers never see it.
            </FieldDescription>
          </Field>
        ) : (
          // ── Code minted — show the two ways to connect ─────────────
          <>
            <Field>
              <FieldLabel>1 · Personal chat (fastest)</FieldLabel>
              <Button asChild className="w-fit">
                <a
                  href={connect.deepLink}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Open @{connect.botUsername} in Telegram
                </a>
              </Button>
              <FieldDescription>
                Opens the bot — tap <b>Start</b>. Orders arrive in your DM.
              </FieldDescription>
            </Field>

            <Field>
              <FieldLabel>2 · Team group (recommended)</FieldLabel>
              <FieldDescription>
                Add{" "}
                <span className="font-mono">@{connect.botUsername}</span> to
                your &ldquo;Orders&rdquo; group, then send this in the group:
              </FieldDescription>
              <code className="mt-1 inline-block w-fit rounded-md border bg-muted px-3 py-1.5 font-mono text-sm">
                /connect {connect.code}
              </code>
            </Field>

            <Field>
              <Button
                type="button"
                variant="outline"
                onClick={handleCheck}
                disabled={pending}
                className="w-fit"
              >
                {pending ? <Spinner className="size-4" /> : "I’ve connected — check"}
              </Button>
              <FieldDescription>
                Code expires in 30 minutes.
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
