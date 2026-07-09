"use client";

import { useEveAgent } from "eve/react";
import {
  ExternalLink,
  FilePen,
  Globe,
  Loader2,
  Monitor,
  RefreshCw,
  Sparkles,
  Terminal,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { recordShopPublish } from "@/app/dashboard/[orgSlug]/[catalogSlug]/builder/actions";

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
import { useT } from "@/lib/locales/dashboard/context";
import type { DashboardMessageKey } from "@/lib/locales/dashboard/messages";

// The Krafta Studio CODEGEN agent — the v0/Lovable-for-commerce engine. Talks to
// the eve agent (studio-agent/) mounted same-origin via withEve, so there's no
// host/URL to configure. It edits a real Krafta shop project in a sandbox; the
// commerce stays on Krafta's engine via @krafta/commerce. The agent's
// `preview_shop` tool runs the shop on a local port and returns a URL we render
// in the live-preview pane beside the chat.
const SUGGESTION_KEYS: DashboardMessageKey[] = [
  "studio.codegen_suggestion_dark_minimal",
  "studio.codegen_suggestion_hero",
  "studio.codegen_suggestion_larger_cards",
  "studio.codegen_suggestion_about_page",
];

// Sentinel stored by readLatestPublish when a publish errors without any
// errorText — the render maps it to a translated generic message.
const GENERIC_PUBLISH_ERROR = "studio:generic-publish-error";

// Map eve's built-in sandbox tools (and our preview tool) to a friendly label.
function toolLabel(
  name: string,
): { labelKey: DashboardMessageKey; icon: typeof FilePen } | null {
  if (name === "write_file")
    return { labelKey: "studio.tool_edited_file", icon: FilePen };
  if (name === "read_file" || name === "glob" || name === "grep")
    return { labelKey: "studio.tool_read_shop", icon: FilePen };
  if (name === "bash")
    return { labelKey: "studio.tool_ran_command", icon: Terminal };
  if (name === "preview_shop")
    return { labelKey: "studio.tool_refreshed_preview", icon: Monitor };
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

// The most recent PUBLISH out of the stream. `publish_shop` surfaces the same
// way as preview; its output carries the public { url }, the { deploymentUrl },
// and { subdomainProvisioned } — false when the <slug>.krafta.org alias didn't
// take and the url is just the raw, temporary deploy URL. A failed publish lands
// as `state: "output-error"`; we capture that so it isn't swallowed (CORR-2).
function readLatestPublish(messages: ReadonlyArray<{ parts?: readonly unknown[] }>): {
  url: string | null;
  deploymentUrl: string | null;
  subdomainProvisioned: boolean;
  intendedUrl: string | null;
  error: string | null;
} {
  let url: string | null = null;
  let deploymentUrl: string | null = null;
  let subdomainProvisioned = true;
  let intendedUrl: string | null = null;
  let error: string | null = null;
  for (const message of messages) {
    for (const raw of (message.parts ?? []) as EvePart[]) {
      if (raw.type !== "dynamic-tool" || raw.toolName !== "publish_shop") continue;
      if (raw.state === "output-available") {
        const output = raw.output as
          | {
              url?: unknown;
              deploymentUrl?: unknown;
              subdomainProvisioned?: unknown;
              intendedUrl?: unknown;
            }
          | undefined;
        if (output && typeof output.url === "string") {
          url = output.url;
          deploymentUrl =
            typeof output.deploymentUrl === "string" ? output.deploymentUrl : null;
          // Default true for older outputs that predate the flag (their url was
          // already the provisioned subdomain); only an explicit false downgrades.
          subdomainProvisioned = output.subdomainProvisioned !== false;
          intendedUrl =
            typeof output.intendedUrl === "string" ? output.intendedUrl : null;
          error = null; // a success supersedes an earlier failure in the stream
        }
      } else if (raw.state === "output-error") {
        error =
          typeof raw.errorText === "string" && raw.errorText
            ? raw.errorText
            : GENERIC_PUBLISH_ERROR;
      }
    }
  }
  return { url, deploymentUrl, subdomainProvisioned, intendedUrl, error };
}

export function StudioCodegenPanel({
  shopName,
  catalogId,
  catalogSlug,
  publishableKey,
  initialPublishedUrl,
}: {
  shopName: string;
  catalogId?: string;
  catalogSlug?: string;
  publishableKey?: string | null;
  initialPublishedUrl?: string | null;
}) {
  const t = useT();
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

  // When the agent publishes the shop, remember the live URL on the catalog so
  // the dashboard shows it across sessions. Persist once per distinct URL.
  const published = useMemo(() => readLatestPublish(messages), [messages]);
  // Show this session's fresh publish, else the URL persisted from a past one.
  const liveUrl = published.url ?? initialPublishedUrl ?? null;
  // A DB-persisted URL is always a real, provisioned subdomain; only a fresh
  // publish whose alias failed is "not provisioned" (a temporary deploy URL).
  const liveProvisioned = published.url ? published.subdomainProvisioned : true;
  const persistedUrl = useRef<string | null>(null);
  useEffect(() => {
    // Only persist a genuinely provisioned subdomain as the shop's canonical
    // published URL — never a temporary *.vercel.app fallback (CORR-3).
    if (!catalogId || !published.url || !published.subdomainProvisioned) return;
    if (persistedUrl.current === published.url) return;
    persistedUrl.current = published.url;
    void recordShopPublish({
      catalogId,
      publishedUrl: published.url,
      deploymentUrl: published.deploymentUrl,
    });
  }, [
    catalogId,
    published.url,
    published.deploymentUrl,
    published.subdomainProvisioned,
  ]);

  const send = (text: string) => {
    const value = text.trim();
    if (!value || busy) return;
    void agent.send({ message: value });
  };

  const handleSubmit = (message: PromptInputMessage) => {
    send(message.text ?? "");
  };

  // The Publish button just asks the agent to publish — it owns the sandbox, so
  // a programmatic message reuses the exact same path as typing it in chat.
  const [publishing, setPublishing] = useState(false);
  useEffect(() => {
    if (!busy) setPublishing(false);
  }, [busy]);
  const publish = () => {
    if (busy) return;
    setPublishing(true);
    send(t("studio.publish_command"));
  };

  const publishErrorSource =
    published.error === GENERIC_PUBLISH_ERROR
      ? t("studio.publish_generic_error")
      : published.error;
  const publishErrorText =
    publishErrorSource && publishErrorSource.length > 160
      ? `${publishErrorSource.slice(0, 160)}…`
      : publishErrorSource;

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
                  {t("studio.beta")}
                </span>
              </div>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {t("studio.codegen_subtitle", { name: shopName })}
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
                  <h3 className="text-base font-medium">{t("studio.codegen_empty_title")}</h3>
                  <p className="text-sm text-muted-foreground">
                    {t("studio.codegen_empty_desc")}
                  </p>
                </div>
                <div className="flex flex-wrap items-center justify-center gap-2">
                  {SUGGESTION_KEYS.map((key) => (
                    <Suggestion
                      key={key}
                      suggestion={t(key)}
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
                              {t(tool.labelKey)}
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
                    <Loader size={14} /> {t("studio.working_on_shop")}
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
              {t("common.error_generic")}
            </p>
          ) : null}
          <PromptInput onSubmit={handleSubmit}>
            <PromptInputBody>
              <PromptInputTextarea placeholder={t("studio.codegen_input_placeholder")} />
            </PromptInputBody>
            <PromptInputFooter>
              <span className="px-1 text-xs text-muted-foreground">
                {t("studio.codegen_footer_note")}
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
            <span className="text-sm font-medium">{t("studio.live_preview")}</span>
            {previewSrc ? (
              <span className="truncate text-xs text-muted-foreground">
                {previewSrc.replace(/^https?:\/\//, "")}
              </span>
            ) : null}
            {liveUrl ? (
              liveProvisioned ? (
                <a
                  href={liveUrl}
                  target="_blank"
                  rel="noreferrer"
                  title={liveUrl}
                  className="inline-flex shrink-0 items-center gap-1 truncate rounded-full border border-emerald-600/30 bg-emerald-600/10 px-2 py-0.5 text-xs font-medium text-emerald-700 transition-colors hover:bg-emerald-600/20"
                >
                  <span className="size-1.5 rounded-full bg-emerald-500" aria-hidden />
                  {t("studio.live_badge")} · {liveUrl.replace(/^https?:\/\//, "")}
                </a>
              ) : (
                <a
                  href={liveUrl}
                  target="_blank"
                  rel="noreferrer"
                  title={t("studio.published_temp_title", {
                    target:
                      published.intendedUrl?.replace(/^https?:\/\//, "") ??
                      t("studio.subdomain_fallback"),
                  })}
                  className="inline-flex shrink-0 items-center gap-1 truncate rounded-full border border-amber-600/30 bg-amber-600/10 px-2 py-0.5 text-xs font-medium text-amber-700 transition-colors hover:bg-amber-600/20"
                >
                  <span className="size-1.5 rounded-full bg-amber-500" aria-hidden />
                  {t("studio.published_temp_badge")}
                </a>
              )
            ) : null}
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <button
              type="button"
              onClick={publish}
              disabled={busy || !catalogId}
              className="mr-1 inline-flex items-center gap-1.5 rounded-md bg-foreground px-2.5 py-1 text-xs font-medium text-background transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
              title={liveUrl ? t("studio.republish_title") : t("studio.publish_title")}
            >
              {publishing ? (
                <Loader2 className="size-3.5 animate-spin" aria-hidden />
              ) : (
                <Globe className="size-3.5" aria-hidden />
              )}
              {publishing
                ? t("studio.publishing")
                : liveUrl
                  ? t("studio.update")
                  : t("studio.publish")}
            </button>
            <button
              type="button"
              onClick={() => setRefreshNonce((n) => n + 1)}
              disabled={!previewSrc}
              className="inline-flex size-7 items-center justify-center rounded-md border border-border bg-background text-muted-foreground transition-colors hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
              title={t("studio.refresh_preview")}
              aria-label={t("studio.refresh_preview")}
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
              title={t("studio.open_new_tab")}
              aria-label={t("studio.open_preview_new_tab")}
            >
              <ExternalLink className="size-3.5" aria-hidden />
            </a>
          </div>
        </div>

        {published.error ? (
          <div className="border-b border-destructive/30 bg-destructive/5 px-4 py-2 text-xs text-destructive">
            {t("studio.publish_failed_banner", {
              error: publishErrorText ?? "",
              action: liveUrl ? t("studio.update") : t("studio.publish"),
            })}
          </div>
        ) : null}

        <div className="relative min-h-0 flex-1">
          {previewSrc ? (
            <iframe
              key={`${previewSrc}:${preview.version}:${refreshNonce}`}
              src={previewSrc}
              title={t("studio.codegen_preview_iframe_title", { name: shopName })}
              className="size-full border-0 bg-white"
            />
          ) : (
            <div className="flex size-full flex-col items-center justify-center gap-3 px-6 text-center">
              <span className="flex size-11 items-center justify-center rounded-full border border-border bg-background">
                <Monitor className="size-5 text-muted-foreground" aria-hidden />
              </span>
              <div className="space-y-1">
                <p className="text-sm font-medium">{t("studio.shop_will_appear")}</p>
                <p className="max-w-xs text-xs text-muted-foreground">
                  {busy
                    ? t("studio.building_shop")
                    : t("studio.codegen_preview_hint")}
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
