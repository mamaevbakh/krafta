"use client";

import { useMemo } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { LayoutDashboard, Search, Sparkles } from "lucide-react";

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

type StudioAgentPanelProps = {
  catalogId: string;
  orgId: string;
  catalogSlug: string;
  catalogName: string;
};

const SUGGESTIONS = [
  "Review my shop and suggest improvements",
  "How should I organize my categories?",
  "What layout fits my shop best?",
  "Write a sharper description for my shop",
];

const TOOL_LABELS: Record<string, { label: string; icon: typeof Search }> = {
  "tool-getCatalogOverview": { label: "Read your shop", icon: LayoutDashboard },
  "tool-searchCatalog": { label: "Searched your menu", icon: Search },
};

export function StudioAgentPanel({
  catalogId,
  orgId,
  catalogName,
}: StudioAgentPanelProps) {
  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: "/api/studio-agent",
        body: { catalogId, orgId },
      }),
    [catalogId, orgId],
  );

  const { messages, sendMessage, status, error } = useChat({ transport });

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
                Beta
              </span>
            </div>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Your AI design partner for {catalogName}
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
                  Let&apos;s shape your shop
                </h3>
                <p className="text-sm text-muted-foreground">
                  Ask about your layout, categories, branding, or how to
                  merchandise your items. I read your live shop and give advice
                  specific to it.
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
                            {meta.label}
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
                  <Loader size={14} /> Thinking…
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
            Something went wrong. Please try again.
          </p>
        ) : null}
        <PromptInput onSubmit={handleSubmit}>
          <PromptInputBody>
            <PromptInputTextarea placeholder="Ask Krafta Studio about your shop…" />
          </PromptInputBody>
          <PromptInputFooter>
            <span className="px-1 text-xs text-muted-foreground">
              Beta · advice &amp; planning. Building actions coming soon.
            </span>
            <PromptInputSubmit status={status} disabled={busy} />
          </PromptInputFooter>
        </PromptInput>
      </div>
    </section>
  );
}
