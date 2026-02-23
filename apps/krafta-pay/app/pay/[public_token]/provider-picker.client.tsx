"use client";

import { useMemo, useState } from "react";

type Provider = {
  id: string;
  name: string;
};

type SelectProviderResponse =
  | { attemptId: string; redirectUrl: string }
  | { error: string };

function getErrorMessage(error: unknown): string {
  if (typeof error === "string") return error;
  if (error && typeof error === "object" && "message" in error && typeof (error as any).message === "string") {
    return (error as any).message;
  }
  return "Unknown error";
}

export function ProviderPicker({
  publicToken,
  providers,
}: {
  publicToken: string;
  providers: Provider[];
}) {
  const uzumProvider = useMemo(
    () => providers.find((p) => p.id === "uzum"),
    [providers]
  );

  const [isStarting, setIsStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [embeddedUrl, setEmbeddedUrl] = useState<string | null>(null);

  async function startProvider(providerId: string, viewType?: "WEB_VIEW" | "IFRAME" | "REDIRECT") {
    setIsStarting(true);
    setError(null);

    try {
      const res = await fetch(
        `/api/checkout_sessions/${encodeURIComponent(publicToken)}/select_provider`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ providerId, viewType }),
        }
      );

      const json = (await res.json().catch(() => ({}))) as SelectProviderResponse;
      if (!res.ok || (json as any).error) {
        throw new Error((json as any).error ?? `http_${res.status}`);
      }

      const redirectUrl = (json as any).redirectUrl as string | undefined;
      if (!redirectUrl) throw new Error("missing_redirect_url");

      if (providerId === "uzum" && viewType === "IFRAME") {
        setEmbeddedUrl(redirectUrl);
        return;
      }

      window.location.assign(redirectUrl);
    } catch (e) {
      setError(getErrorMessage(e));
    } finally {
      setIsStarting(false);
    }
  }

  return (
    <>
      <div className="mt-3 space-y-2">
        {providers.map((p) => {
          return (
          <div key={p.id} className="rounded-md border p-1">
            <button
              type="button"
              className="w-full rounded-md px-4 py-3 text-left hover:bg-muted disabled:opacity-60"
              disabled={isStarting}
              onClick={() => startProvider(p.id, p.id === "uzum" ? "IFRAME" : "REDIRECT")}
            >
              <div className="flex items-center justify-between">
                <span>{p.name}</span>
              </div>
            </button>
          </div>
          );
        })}

        {error ? (
          <div className="mt-3 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            {error}
          </div>
        ) : null}

        {!uzumProvider ? (
          <div className="mt-3 text-xs text-muted-foreground">
            Uzum isn&apos;t configured for this merchant/environment.
          </div>
        ) : null}
      </div>

      {embeddedUrl ? (
        <div className="fixed inset-0 z-50 bg-background">
          <div className="flex h-dvh w-screen flex-col">
            <div className="flex items-center justify-between border-b px-3 py-2">
              <div className="text-sm font-medium">Secure payment</div>
              <div className="flex items-center gap-2">
                <a
                  href={embeddedUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="rounded-md border px-3 py-1 text-xs hover:bg-muted"
                >
                  Open in new tab
                </a>
                <button
                  type="button"
                  className="rounded-md border px-3 py-1 text-xs hover:bg-muted"
                  onClick={() => setEmbeddedUrl(null)}
                >
                  Close
                </button>
              </div>
            </div>

            <iframe
              title="Uzum Checkout"
              src={embeddedUrl}
              className="h-full w-full flex-1 bg-white"
              allow="payment *; clipboard-read *; clipboard-write *"
            />
          </div>
        </div>
      ) : null}
    </>
  );
}
