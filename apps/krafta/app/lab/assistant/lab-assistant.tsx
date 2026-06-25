"use client";

import * as React from "react";
import { Sparkles } from "lucide-react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";

import {
  Conversation,
  ConversationContent,
  ConversationEmptyState,
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
  type PromptInputMessage,
  PromptInputSubmit,
  PromptInputTextarea,
  PromptInputTools,
} from "@/components/ai-elements/prompt-input";
import {
  Tool,
  ToolContent,
  ToolHeader,
  ToolInput,
  ToolOutput,
} from "@/components/ai-elements/tool";
import { Suggestion, Suggestions } from "@/components/ai-elements/suggestion";

const SUGGESTIONS = [
  "What do you recommend?",
  "Я ищу подарок",
  "Show me watches under $5000",
];

export function LabAssistant({
  catalogId,
  orgId,
  shopName,
  slug,
}: {
  catalogId: string;
  orgId?: string | null;
  shopName: string;
  slug: string;
}) {
  const [input, setInput] = React.useState("");

  const transport = React.useMemo(
    () =>
      new DefaultChatTransport({
        api: "/api/shop-assistant",
        body: { catalogId, orgId: orgId ?? null },
      }),
    [catalogId, orgId],
  );

  const { messages, sendMessage, status } = useChat({ transport });

  const submit = React.useCallback(
    (text: string) => {
      const value = text.trim();
      if (!value || status === "submitted" || status === "streaming") return;
      void sendMessage({ text: value });
      setInput("");
    },
    [sendMessage, status],
  );

  return (
    <div className="mx-auto flex h-[100dvh] max-w-2xl flex-col px-4 py-3">
      <header className="mb-2 flex items-center gap-2 border-b pb-3">
        <Sparkles className="size-4" aria-hidden />
        <div className="flex flex-col">
          <span className="text-sm font-semibold">{shopName} — assistant</span>
          <span className="text-xs text-muted-foreground">
            AI Elements lab · catalog “{slug}”
          </span>
        </div>
      </header>

      <Conversation className="min-h-0 flex-1">
        <ConversationContent>
          {messages.length === 0 ? (
            <ConversationEmptyState
              icon={<Sparkles className="size-10" />}
              title={`Ask ${shopName}`}
              description="Conversational search rendered with Vercel AI Elements. Type in any language."
            />
          ) : (
            messages.map((message) => (
              <Message from={message.role} key={message.id}>
                <MessageContent>
                  {(message.parts as Array<Record<string, unknown>>).map(
                    (part, i) => {
                      const type = String(part.type ?? "");
                      if (type === "text") {
                        return (
                          <MessageResponse key={i}>
                            {String(part.text ?? "")}
                          </MessageResponse>
                        );
                      }
                      if (type.startsWith("tool-")) {
                        return (
                          <Tool key={i} defaultOpen={false}>
                            <ToolHeader
                              type={type as `tool-${string}`}
                              state={
                                part.state as Parameters<
                                  typeof ToolHeader
                                >[0]["state"]
                              }
                            />
                            <ToolContent>
                              <ToolInput input={part.input} />
                              <ToolOutput
                                output={part.output as React.ReactNode}
                                errorText={
                                  part.errorText as string | undefined
                                }
                              />
                            </ToolContent>
                          </Tool>
                        );
                      }
                      return null;
                    },
                  )}
                </MessageContent>
              </Message>
            ))
          )}
        </ConversationContent>
        <ConversationScrollButton />
      </Conversation>

      <Suggestions className="my-2">
        {SUGGESTIONS.map((s) => (
          <Suggestion key={s} suggestion={s} onClick={(value) => submit(value)} />
        ))}
      </Suggestions>

      <PromptInput
        onSubmit={(message: PromptInputMessage) => submit(message.text ?? "")}
      >
        <PromptInputBody>
          <PromptInputTextarea
            value={input}
            onChange={(e) => setInput(e.currentTarget.value)}
            placeholder="Ask anything…"
          />
        </PromptInputBody>
        <PromptInputFooter>
          <PromptInputTools />
          <PromptInputSubmit status={status} disabled={!input.trim()} />
        </PromptInputFooter>
      </PromptInput>
    </div>
  );
}
