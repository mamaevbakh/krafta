"use client";

import { useEveAgent } from "eve/react";
import {
  ExternalLink,
  FilePen,
  Monitor,
  RefreshCw,
  Sparkles,
  Terminal,
} from "lucide-react";
import { useMemo, useState } from "react";

import {
  Conversation,
  ConversationContent,
  ConversationScrollButton,
} from "@/components/ai-elements/conversation";
import {
  Message,
  MessageContent,
  MessageResponse,
} from "@/components/ai-elements/message";
import {
  PromptInput,
  PromptInputBody,
  PromptInputFooter,
  PromptInputSubmit,
  PromptInputTextarea,
  type PromptInputMessage,
} from "@/components/ai-elements/prompt-input";
import { Suggestion } from "@/components/ai-elements/suggestion";
import { Loader } from "@/components/ai-elements/loader";

// The Krafta Studio CODEGEN agent — the v0/Lovable-for-commerce engine. Talks to
// the eve agent (studio-agent/) mounted same-origin via withEve, so there's no
// host/URL to configure. It edits a real Krafta shop project in a sandbox; the
// commerce stays on Krafta's engine via @krafta/commerce. The agent's
// `preview_shop` tool runs the shop on a local port and returns a URL we render
// in the live-preview pane beside the chat.
const SUGGESTIONS = [
  "Make the shop dark and minimal",
  "Add a hero with a bold headline",
  "Use larger product cards",
  "Add an About page",
];

// Map eve's built-in sandbox tools (and our preview tool) to a friendly label.
function toolLabel(name: string): { label: string; icon: typeof FilePen } | null {
  if (name === "write_file") return { label: "Edited a file", icon: FilePen };
  if (name === "read_file" || name === "glob" || name === "grep")
    return { label: "Read your shop", icon: FilePen };
  if (name === "bash") return { label: "Ran a command", icon: Terminal };
  if (name === "preview_shop")
    return { label: "Refreshed the preview", icon: Monitor };
  return null;
}

// Where the sandbox shop fetches commerce from. An explicit NEXT_PUBLIC_KRAFTA_API_URL
// always wins (staging/prod). Otherwise default to the dashboard's OWN origin — the same
// app serves /api/commerce/v1 — so a local dev dashboard binds the preview to its own
// (dev-DB) catalog instead of hardcoding prod, which wouldn't have the catalog. Falls
// back to prod only during SSR, before window is available; the value is read at
// send-time on the client, so the runtime origin is what actually ships.
const KRAFTA_API_URL_ENV = process.env.NEXT_PUBLIC_KRAFTA_API_URL;

function resolveCommerceApiUrl(): string {
  if (KRAFTA_API_URL_ENV) return KRAFTA_API_URL_ENV;
  if (typeof window !== "undefined") return window.location.origin;
  return "https://www.krafta.org";
}

type EvePart = Record<string, unknown>;

// Pull the most recent live-preview out of the message stream. The agent's
// `preview_shop` tool surfaces as a `dynamic-tool` part; when it finishes, the
// part carries `state: "output-available"` and `output: { url, port }`. We also
// count how many previews have completed so the iframe remounts (reloads) on
// each new one even when the URL is unchanged.
function readLatestPreview(messages: ReadonlyArray<{ parts?: readonly unknown[] }>): {
  url: string | null;
  port: number | null;
  version: number;
} {
  let url: string | null = null;
  let port: number | null = null;
  let version = 0;
  for (const message of messages) {
    for (const raw of (message.parts ?? []) as EvePart[]) {
      if (
        raw.type === "dynamic-tool" &&
        raw.toolName === "preview_shop" &&
        raw.state === "output-available"
      ) {
        const output = raw.output as { url?: unknown; port?: unknown } | undefined;
        if (output && typeof output.url === "string") {
          url = output.url;
          port = typeof output.port === "number" ? output.port : null;
          version += 1;
        }
      }
    }
  }
  return { url, port, version };
}

export function StudioCodegenPanel({
  shopName,
  catalogId,
  catalogSlug,
  publishableKey,
}: {
  shopName: string;
  catalogId?: string;
  catalogSlug?: string;
  publishableKey?: string | null;
}) {
  // Tell the agent which shop it's building for. clientContext rides every turn
  // (per eve's prepareSend) as ephemeral context — the agent writes the sandbox's
  // .env.local from it (NEXT_PUBLIC_KRAFTA_API_URL + NEXT_PUBLIC_KRAFTA_PUBLISHABLE_KEY)
  // so the generated shop renders THIS catalog's data through @krafta/commerce.
  const agent = useEveAgent({
    prepareSend: (input) => ({
      ...input,
      clientContext: {
        shopName,
        catalogId: catalogId ?? null,
        // Resolved at send-time (always client-side) so the dev dashboard's own
        // origin is used when NEXT_PUBLIC_KRAFTA_API_URL is unset.
        commerceApiUrl: resolveCommerceApiUrl(),
        publishableKey: publishableKey ?? null,
        // The shop's slug → its <slug>.krafta.org subdomain when published.
        subdomain: catalogSlug ?? null,
      },
    }),
  });
  const busy = agent.status === "submitted" || agent.status === "streaming";
  const messages = agent.data.messages;
  const isEmpty = messages.length === 0;

  // Manual refresh nonce — bumping it remounts the iframe to force a reload.
  const [refreshNonce, setRefreshNonce] = useState(0);
  const preview = useMemo(() => readLatestPreview(messages), [messages]);

  // The preview server binds 0.0.0.0; point the iframe at whatever host the
  // dashboard is on (localhost on the Mac, or the LAN IP from a phone) so the
  // pane works on both. Fall back to the tool's 127.0.0.1 URL.
  const previewSrc = useMemo(() => {
    if (preview.port && typeof window !== "undefined") {
      return `http://${window.location.hostname}:${preview.port}`;
    }
    return preview.url;
  }, [preview.port, preview.url]);

  const send = (text: string) => {
    const value = text.trim();
    if (!value || busy) return;
    void agent.send({ message: value });
  };

  const handleSubmit = (message: PromptInputMessage) => {
    send(message.text ?? "");
  };

  return (
    <section className="flex h-[78vh] min-h-[580px] w-full flex-col overflow-hidden rounded-xl border border-border bg-background lg:flex-row">
      {/* ── Chat pane ──────────────────────────────────────────────── */}
      <div className="flex min-h-0 flex-1 flex-col lg:w-[420px] lg:flex-none lg:border-r lg:border-border">
        <header className="flex items-center justify-between gap-3 border-b border-border px-5 py-4">
          <div className="flex items-center gap-3">
            <span className="flex size-9 items-center justify-center rounded-md border border-border bg-muted/40">
              <Sparkles className="size-4" aria-hidden />
            </span>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-medium">Krafta Studio</h2>
                <span className="rounded-full border border-border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                  Beta
                </span>
              </div>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Build {shopName} by describing it — the AI writes the code
              </p>
            </div>
          </div>
        </header>

        <Conversation className="flex-1">
          <ConversationContent>
            {isEmpty ? (
              <div className="m-auto flex max-w-md flex-col items-center gap-4 px-4 py-10 text-center">
                <span className="flex size-11 items-center justify-center rounded-full border border-border bg-muted/40">
                  <Sparkles className="size-5 text-muted-foreground" aria-hidden />
                </span>
                <div className="space-y-1">
                  <h3 className="text-base font-medium">Describe your shop</h3>
                  <p className="text-sm text-muted-foreground">
                    Tell me how it should look and what pages it needs. I build it
                    in real code on Krafta&apos;s commerce engine, and you&apos;ll
                    see it live on the right.
                  </p>
                </div>
                <div className="flex flex-wrap items-center justify-center gap-2">
                  {SUGGESTIONS.map((suggestion) => (
                    <Suggestion
                      key={suggestion}
                      suggestion={suggestion}
                      onClick={send}
                    />
                  ))}
                </div>
              </div>
            ) : (
              messages.map((message) => {
                const parts = (message.parts ?? []) as unknown as Array<
                  Record<string, unknown>
                >;
                const text = parts
                  .filter((part) => part.type === "text")
                  .map((part) => String(part.text ?? ""))
                  .join("");
                const tools = parts
                  .filter(
                    (part) =>
                      typeof part.type === "string" &&
                      (part.type as string).includes("tool"),
                  )
                  .map((part) =>
                    toolLabel(String(part.toolName ?? part.type ?? "")),
                  )
                  .filter((entry): entry is NonNullable<typeof entry> => !!entry);

                return (
                  <Message from={message.role} key={message.id}>
                    {message.role === "assistant" && tools.length > 0 ? (
                      <div className="flex flex-wrap items-center gap-1.5">
                        {tools.map((tool, index) => {
                          const Icon = tool.icon;
                          return (
                            <span
                              key={`${message.id}-tool-${index}`}
                              className="inline-flex items-center gap-1.5 rounded-full border border-border bg-muted/30 px-2.5 py-1 text-xs text-muted-foreground"
                            >
                              <Icon className="size-3" aria-hidden />
                              {tool.label}
                            </span>
                          );
                        })}
                      </div>
                    ) : null}
                    {text ? (
                      <MessageContent>
                        {message.role === "assistant" ? (
                          <MessageResponse>{text}</MessageResponse>
                        ) : (
                          text
                        )}
                      </MessageContent>
                    ) : null}
                  </Message>
                );
              })
            )}

            {agent.status === "submitted" ? (
              <Message from="assistant">
                <MessageContent>
                  <span className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader size={14} /> Working on your shop…
                  </span>
                </MessageContent>
              </Message>
            ) : null}
          </ConversationContent>
          <ConversationScrollButton />
        </Conversation>

        <div className="border-t border-border p-3">
          {agent.error ? (
            <p className="mb-2 px-1 text-xs text-destructive">
              Something went wrong. Please try again.
            </p>
          ) : null}
          <PromptInput onSubmit={handleSubmit}>
            <PromptInputBody>
              <PromptInputTextarea placeholder="Describe a change to your shop…" />
            </PromptInputBody>
            <PromptInputFooter>
              <span className="px-1 text-xs text-muted-foreground">
                Beta · the AI edits real code.
              </span>
              {/* While streaming the button shows a stop square — clicking it
                  aborts the turn instead of submitting. Only "submitted"
                  (request sent, no stream yet) is non-cancelable. */}
              <PromptInputSubmit
                status={agent.status}
                disabled={agent.status === "submitted"}
                onClick={(event) => {
                  if (agent.status === "streaming") {
                    event.preventDefault();
                    agent.stop();
                  }
                }}
              />
            </PromptInputFooter>
          </PromptInput>
        </div>
      </div>

      {/* ── Live preview pane ──────────────────────────────────────── */}
      <div className="flex min-h-[320px] flex-1 flex-col border-t border-border bg-muted/20 lg:min-h-0 lg:border-t-0">
        <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-2.5">
          <div className="flex min-w-0 items-center gap-2">
            <Monitor className="size-4 shrink-0 text-muted-foreground" aria-hidden />
            <span className="text-sm font-medium">Live preview</span>
            {previewSrc ? (
              <span className="truncate text-xs text-muted-foreground">
                {previewSrc.replace(/^https?:\/\//, "")}
              </span>
            ) : null}
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <button
              type="button"
              onClick={() => setRefreshNonce((n) => n + 1)}
              disabled={!previewSrc}
              className="inline-flex size-7 items-center justify-center rounded-md border border-border bg-background text-muted-foreground transition-colors hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
              title="Refresh preview"
              aria-label="Refresh preview"
            >
              <RefreshCw className="size-3.5" aria-hidden />
            </button>
            <a
              href={previewSrc ?? undefined}
              target="_blank"
              rel="noreferrer"
              aria-disabled={!previewSrc}
              className={`inline-flex size-7 items-center justify-center rounded-md border border-border bg-background text-muted-foreground transition-colors hover:text-foreground ${
                previewSrc ? "" : "pointer-events-none opacity-40"
              }`}
              title="Open in a new tab"
              aria-label="Open preview in a new tab"
            >
              <ExternalLink className="size-3.5" aria-hidden />
            </a>
          </div>
        </div>

        <div className="relative min-h-0 flex-1">
          {previewSrc ? (
            <iframe
              key={`${previewSrc}:${preview.version}:${refreshNonce}`}
              src={previewSrc}
              title={`Live preview of ${shopName}`}
              className="size-full border-0 bg-white"
            />
          ) : (
            <div className="flex size-full flex-col items-center justify-center gap-3 px-6 text-center">
              <span className="flex size-11 items-center justify-center rounded-full border border-border bg-background">
                <Monitor className="size-5 text-muted-foreground" aria-hidden />
              </span>
              <div className="space-y-1">
                <p className="text-sm font-medium">Your shop will appear here</p>
                <p className="max-w-xs text-xs text-muted-foreground">
                  {busy
                    ? "Building your shop…"
                    : "Describe a change in the chat and the AI builds it — the live preview shows up here."}
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
