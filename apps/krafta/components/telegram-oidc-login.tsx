"use client";

// "Log In With Telegram" — the new OIDC popup flow that replaces the legacy
// iframe widget (telegram-login-button.tsx). Loads Telegram's library once,
// then our own button calls Telegram.Login.auth({client_id}) to open the popup
// (no iframe, no data-onauth global). The popup returns a signed id_token
// (OIDC JWT); we hand it to onAuth, which posts it to a server action that
// verifies it (lib/telegram/oidc-login.ts) — the trust boundary.
//
// client_id is the NUMERIC bot id BotFather issues under Bot Settings -> Web
// Login (passed in from TELEGRAM_LOGIN_CLIENT_ID). The popup needs the page
// origin registered as an Allowed URL there, and a non-`same-origin`
// Cross-Origin-Opener-Policy (Krafta sets none).

import * as React from "react";

import { Button } from "@/components/ui/button";

const SCRIPT_SRC = "https://oauth.telegram.org/js/telegram-login.js?5";

type TelegramLoginResult = {
  id_token?: string;
  user?: unknown;
  error?: string;
};

type TelegramLoginApi = {
  auth: (
    options: {
      client_id: number;
      request_access?: string[];
      lang?: string;
      nonce?: string;
    },
    callback: (data: TelegramLoginResult) => void,
  ) => void;
};

// Local accessor instead of a global Window augmentation — tma-bridge.tsx
// already augments window.Telegram (with WebApp), and two differing
// declarations of the same property collide.
function telegramLogin(): TelegramLoginApi | undefined {
  return (window as unknown as { Telegram?: { Login?: TelegramLoginApi } })
    .Telegram?.Login;
}

function useTelegramLoginScript(): boolean {
  const [ready, setReady] = React.useState(false);
  React.useEffect(() => {
    if (telegramLogin()?.auth) {
      setReady(true);
      return;
    }
    const existing = document.querySelector<HTMLScriptElement>(
      `script[src="${SCRIPT_SRC}"]`,
    );
    if (existing) {
      const onLoad = () => setReady(true);
      existing.addEventListener("load", onLoad);
      return () => existing.removeEventListener("load", onLoad);
    }
    const script = document.createElement("script");
    script.src = SCRIPT_SRC;
    script.async = true;
    script.onload = () => setReady(true);
    document.head.appendChild(script);
  }, []);
  return ready;
}

export function TelegramOidcLoginButton({
  clientId,
  onAuth,
  disabled,
  className,
  requestAccess,
}: {
  /** Numeric bot Client ID from BotFather (Bot Settings -> Web Login). */
  clientId: string | number;
  /** Receives the popup's signed id_token (an OIDC JWT) for server verification. */
  onAuth: (idToken: string) => void;
  disabled?: boolean;
  className?: string;
  /** Optional extra permissions, e.g. ["write"] to let the bot DM the user. */
  requestAccess?: string[];
}) {
  const ready = useTelegramLoginScript();
  const onAuthRef = React.useRef(onAuth);
  React.useEffect(() => {
    onAuthRef.current = onAuth;
  });

  const open = () => {
    const api = telegramLogin();
    if (!api?.auth) return;
    api.auth(
      {
        client_id: Number(clientId),
        ...(requestAccess?.length ? { request_access: requestAccess } : {}),
      },
      (data) => {
        if (data?.id_token) onAuthRef.current(data.id_token);
      },
    );
  };

  return (
    <Button
      type="button"
      variant="outline"
      className={className ?? "w-full"}
      onClick={open}
      disabled={disabled || !ready}
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        className="size-5 mr-2"
        fill="currentColor"
        aria-hidden="true"
      >
        <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z" />
      </svg>
      Continue with Telegram
    </Button>
  );
}
