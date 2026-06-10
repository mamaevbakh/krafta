"use client";

// KRA-46 / ADR 0006 — the official Telegram Login Widget in data-onauth mode.
//
// The widget is a Telegram-served iframe (the iframe IS the auth surface —
// it's what lets Telegram recognize the logged-in user), so this is the one
// third-party element shadcn can't replace. data-onauth keeps the whole flow
// in-page: no redirect, no resume machinery — the payload lands in the
// `onAuth` callback and goes straight to a server action, which is the trust
// boundary (HMAC verification happens there, never here).
//
// `window.onTelegramAuth` is intentionally a stable global: the e2e spec
// drives it directly with a payload signed by the dev bot token, bypassing
// only the un-automatable iframe.

import * as React from "react";

import { cn } from "@/lib/utils";

export type TelegramAuthPayload = Record<string, unknown>;

declare global {
  interface Window {
    onTelegramAuth?: (user: TelegramAuthPayload) => void;
  }
}

export function TelegramLoginButton({
  botUsername,
  onAuth,
  disabled,
  className,
}: {
  /** Without the leading @ (BotFather /setdomain must cover this origin). */
  botUsername: string;
  onAuth: (payload: TelegramAuthPayload) => void;
  /** The iframe can't be natively disabled; this gates pointer events. */
  disabled?: boolean;
  className?: string;
}) {
  const containerRef = React.useRef<HTMLDivElement>(null);
  const onAuthRef = React.useRef(onAuth);
  React.useEffect(() => {
    onAuthRef.current = onAuth;
  });

  React.useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    window.onTelegramAuth = (user) => onAuthRef.current(user);
    const script = document.createElement("script");
    script.src = "https://telegram.org/js/telegram-widget.js?22";
    script.async = true;
    script.setAttribute("data-telegram-login", botUsername);
    script.setAttribute("data-size", "large");
    // No avatar bubble — keeps the button compact and closer to the
    // surrounding chrome (DESIGN.md: decoration earns its pixels).
    script.setAttribute("data-userpic", "false");
    script.setAttribute("data-onauth", "onTelegramAuth(user)");
    container.appendChild(script);
    return () => {
      container.replaceChildren();
      delete window.onTelegramAuth;
    };
  }, [botUsername]);

  return (
    <div
      ref={containerRef}
      className={cn(
        // The iframe sizes itself; center it and reserve the widget height
        // so the dialog doesn't jump when it loads.
        "flex min-h-10 items-center justify-center",
        disabled && "pointer-events-none opacity-50",
        className,
      )}
      aria-disabled={disabled}
    />
  );
}
