"use client";

import { useEffect, useMemo } from "react";
import { useChat } from "@ai-sdk/react";
import {
  DefaultChatTransport,
  lastAssistantMessageIsCompleteWithToolCalls,
} from "ai";
import { LayoutDashboard, Search, Sparkles, Wand2 } from "lucide-react";

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
import type { DesignPatch } from "@/lib/tools/studio-design-tools";
import { useT } from "@/lib/locales/dashboard/context";
import type { DashboardMessageKey } from "@/lib/locales/dashboard/messages";

type StudioAgentPanelProps = {
  catalogId: string;
  orgId: string;
  catalogSlug: string;
  catalogName: string;
  /** Applies an agent design change to the live builder state (the merchant
   *  then keeps it with "Save changes"). When omitted, applyDesign is a no-op. */
  onApplyDesign?: (patch: DesignPatch) => void;
};

const SUGGESTION_KEYS: DashboardMessageKey[] = [
  "studio.agent_suggestion_review",
  "studio.agent_suggestion_big_photos",
  "studio.agent_suggestion_centered_header",
  "studio.agent_suggestion_three_columns",
];

const TOOL_LABELS: Record<
  string,
  { labelKey: DashboardMessageKey; icon: typeof Search }
> = {
  "tool-getCatalogOverview": { labelKey: "studio.tool_read_shop", icon: LayoutDashboard },
  "tool-applyDesign": { labelKey: "studio.tool_updated_design", icon: Wand2 },
  "tool-searchCatalog": { labelKey: "studio.tool_searched_menu", icon: Search },
};

export function StudioAgentPanel({
  catalogId,
  orgId,
  catalogName,
  onApplyDesign,
}: StudioAgentPanelProps) {
  const t = useT();
  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: "/api/studio-agent",
        body: { catalogId, orgId },
      }),
    [catalogId, orgId],
  );

  const { messages, sendMessage, status, error, addToolResult } = useChat({
    transport,
    sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithToolCalls,
  });

  // Resolve the applyDesign CLIENT tool once the stream settles (mirrors the
  // storefront assistant's post-commit resolution): apply the patch to the live
  // builder state and report the result so the agent can confirm. Guard on
  // state "input-available" so each tool call resolves exactly once.
  useEffect(() => {
    if (status !== "ready") return;
    const last = messages[messages.length - 1];
    if (!last || last.role !== "assistant") return;
    const parts = (last.parts ?? []) as Array<Record<string, unknown>>;
    for (const part of parts) {
      if (part.type === "tool-applyDesign" && part.state === "input-available") {
        const patch = (part.input ?? {}) as DesignPatch;
        onApplyDesign?.(patch);
        void addToolResult({
          tool: "applyDesign",
          toolCallId: String(part.toolCallId),
          output: { ok: true, applied: patch },
        });
      }
    }
  }, [messages, status, addToolResult, onApplyDesign]);

  const busy = status === "submitted" || status === "streaming";
  const isEmpty = messages.length === 0;

  const handleSubmit = (message: PromptInputMessage) => {
    const text = message.text?.trim();
    if (!text || busy) return;
    sendMessage({ text });
  };

  const send = (text: string) => {
    if (busy) return;
    sendMessage({ text });
  };

  return (
    <section className="flex h-[72vh] min-h-[560px] w-full flex-col overflow-hidden rounded-xl border border-border bg-background">
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
              {t("studio.agent_subtitle", { name: catalogName })}
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
                <h3 className="text-base font-medium">
                  {t("studio.agent_empty_title")}
                </h3>
                <p className="text-sm text-muted-foreground">
                  {t("studio.agent_empty_desc")}
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
              const parts = (message.parts ?? []) as Array<
                Record<string, unknown>
              >;
              const text = parts
                .filter((part) => part.type === "text")
                .map((part) => String(part.text ?? ""))
                .join("");
              const toolParts = parts.filter(
                (part) =>
                  typeof part.type === "string" &&
                  (part.type as string).startsWith("tool-"),
              );

              return (
                <Message from={message.role} key={message.id}>
                  {message.role === "assistant" && toolParts.length > 0 ? (
                    <div className="flex flex-wrap items-center gap-1.5">
                      {toolParts.map((part, index) => {
                        const meta = TOOL_LABELS[part.type as string];
                        if (!meta) return null;
                        const Icon = meta.icon;
                        return (
                          <span
                            key={`${message.id}-tool-${index}`}
                            className="inline-flex items-center gap-1.5 rounded-full border border-border bg-muted/30 px-2.5 py-1 text-xs text-muted-foreground"
                          >
                            <Icon className="size-3" aria-hidden />
                            {t(meta.labelKey)}
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

          {status === "submitted" ? (
            <Message from="assistant">
              <MessageContent>
                <span className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader size={14} /> {t("studio.thinking")}
                </span>
              </MessageContent>
            </Message>
          ) : null}
        </ConversationContent>
        <ConversationScrollButton />
      </Conversation>

      <div className="border-t border-border p-3">
        {error ? (
          <p className="mb-2 px-1 text-xs text-destructive">
            {t("common.error_generic")}
          </p>
        ) : null}
        <PromptInput onSubmit={handleSubmit}>
          <PromptInputBody>
            <PromptInputTextarea placeholder={t("studio.agent_input_placeholder")} />
          </PromptInputBody>
          <PromptInputFooter>
            <span className="px-1 text-xs text-muted-foreground">
              {t("studio.agent_footer_note")}
            </span>
            <PromptInputSubmit status={status} disabled={busy} />
          </PromptInputFooter>
        </PromptInput>
      </div>
    </section>
  );
}
