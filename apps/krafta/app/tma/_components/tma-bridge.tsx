"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

import { BrandWordmark } from "@/components/brand/brand-wordmark";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";

/**
 * tma-bridge.tsx — the Telegram Mini App entry handshake.
 *
 * The shared @KraftaBot Main Mini App always opens this one route
 * (`t.me/KraftaBot?startapp=<catalog-slug>`). This client:
 *   1. loads Telegram's official web-app SDK,
 *   2. reads the HMAC-signed `initData` + `start_param` (the shop slug),
 *   3. POSTs them to /api/tma/session, which verifies and installs a Supabase
 *      session cookie scoped to this Telegram shopper,
 *   4. soft-navigates to the existing storefront `/<slug>`, which now renders
 *      authenticated — the cart/checkout reuse unchanged.
 *
 * A soft `router.replace` (not a reload) keeps the Telegram SDK context alive
 * across the navigation so theme + back-button behaviour persists.
 */

const TG_SCRIPT_SRC = "https://telegram.org/js/telegram-web-app.js";

type TelegramWebApp = {
  initData: string;
  initDataUnsafe?: { start_param?: string };
  ready: () => void;
  expand?: () => void;
  disableVerticalSwipes?: () => void;
};

declare global {
  interface Window {
    Telegram?: { WebApp?: TelegramWebApp };
  }
}

function loadTelegramSdk(): Promise<TelegramWebApp | null> {
  return new Promise((resolve, reject) => {
    if (typeof window === "undefined") return resolve(null);
    if (window.Telegram?.WebApp) return resolve(window.Telegram.WebApp);

    const done = () => resolve(window.Telegram?.WebApp ?? null);
    const fail = () => reject(new Error("tg_sdk_failed"));

    const existing = document.querySelector<HTMLScriptElement>(
      `script[src="${TG_SCRIPT_SRC}"]`,
    );
    if (existing) {
      existing.addEventListener("load", done);
      existing.addEventListener("error", fail);
      if (window.Telegram?.WebApp) resolve(window.Telegram.WebApp);
      return;
    }

    const script = document.createElement("script");
    script.src = TG_SCRIPT_SRC;
    script.async = true;
    script.onload = done;
    script.onerror = fail;
    document.head.appendChild(script);
  });
}

type Phase =
  | { kind: "loading" }
  | { kind: "outside" }
  | { kind: "error" };

export function TmaBridge() {
  const router = useRouter();
  const [phase, setPhase] = React.useState<Phase>({ kind: "loading" });
  const startedRef = React.useRef(false);

  React.useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    let cancelled = false;

    (async () => {
      let webApp: TelegramWebApp | null;
      try {
        webApp = await loadTelegramSdk();
      } catch {
        if (!cancelled) setPhase({ kind: "error" });
        return;
      }

      // Opened outside Telegram (or no signed payload) — nothing to verify.
      if (!webApp || !webApp.initData) {
        if (!cancelled) setPhase({ kind: "outside" });
        return;
      }

      try {
        webApp.ready();
        webApp.expand?.();
        webApp.disableVerticalSwipes?.();
      } catch {
        /* viewport niceties are best-effort */
      }

      try {
        const res = await fetch("/api/tma/session", {
          method: "POST",
          headers: { "content-type": "application/json" },
          credentials: "same-origin",
          body: JSON.stringify({
            initData: webApp.initData,
            startParam: webApp.initDataUnsafe?.start_param ?? null,
          }),
        });

        if (!res.ok) {
          if (!cancelled) setPhase({ kind: "error" });
          return;
        }

        const data = (await res.json()) as { catalog_slug?: string };
        if (!data.catalog_slug) {
          if (!cancelled) setPhase({ kind: "error" });
          return;
        }

        if (cancelled) return;
        router.replace(`/${data.catalog_slug}`);
      } catch {
        if (!cancelled) setPhase({ kind: "error" });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [router]);

  return (
    <main className="flex min-h-svh flex-col items-center justify-center gap-6 bg-background px-6 text-center">
      <BrandWordmark className="text-3xl" />

      {phase.kind === "loading" ? (
        <div className="flex flex-col items-center gap-3">
          <Spinner className="size-6 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">Загружаем меню…</p>
        </div>
      ) : phase.kind === "outside" ? (
        <p className="max-w-xs text-sm text-muted-foreground">
          Откройте эту страницу через Telegram, чтобы сделать заказ.
        </p>
      ) : (
        <div className="flex flex-col items-center gap-4">
          <p className="max-w-xs text-sm text-muted-foreground">
            Не удалось открыть магазин. Попробуйте ещё раз.
          </p>
          <Button
            type="button"
            variant="outline"
            onClick={() => window.location.reload()}
          >
            Повторить
          </Button>
        </div>
      )}
    </main>
  );
}
