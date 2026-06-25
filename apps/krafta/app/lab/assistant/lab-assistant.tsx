"use client";

import * as React from "react";
import Image from "next/image";
import { ArrowUp, Sparkles } from "lucide-react";
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
import { Loader } from "@/components/ai-elements/loader";
import { Suggestion, Suggestions } from "@/components/ai-elements/suggestion";
import type {
  PublicCategoryWithItems,
  PublicItem,
} from "@/lib/catalogs/types";
import type { CurrencySettings } from "@/lib/catalogs/settings/currency";
import { getItemImageUrl } from "@/lib/catalogs/media";
import { formatPriceCents } from "@/lib/catalogs/pricing";

const SUGGESTIONS = [
  "What do you recommend?",
  "Я ищу подарок",
  "Show me watches under $5000",
];

type ToolResultItem = {
  entityId: string | null;
  kind: "item" | "category";
  title: string | null;
  category: string | null;
};

// Give the assistant message its own surface (AI Elements ships assistant
// messages flat/full-width by default; user messages get a bubble).
const ASSISTANT_BUBBLE =
  "group-[.is-assistant]:rounded-2xl group-[.is-assistant]:bg-muted group-[.is-assistant]:px-4 group-[.is-assistant]:py-3";

export function LabAssistant({
  catalogId,
  orgId,
  shopName,
  slug,
  categoriesWithItems,
  currencySettings,
}: {
  catalogId: string;
  orgId?: string | null;
  shopName: string;
  slug: string;
  categoriesWithItems: PublicCategoryWithItems[];
  currencySettings?: CurrencySettings;
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

  // id -> { item, categorySlug } so a search hit (entityId) resolves to a real
  // product (image, price, slug) for a rich card — the hybrid's whole point.
  const itemById = React.useMemo(() => {
    const map = new Map<
      string,
      { item: PublicItem; categorySlug: string | null }
    >();
    categoriesWithItems.forEach((category) => {
      const categorySlug = category.slug ?? String(category.id);
      category.items.forEach((item) => map.set(item.id, { item, categorySlug }));
    });
    return map;
  }, [categoriesWithItems]);

  const ProductCards = ({ results }: { results: ToolResultItem[] }) => {
    const cards = results
      .filter((r) => r.kind === "item" && r.entityId)
      .map((r) => ({ r, resolved: itemById.get(r.entityId as string) }))
      .filter((x) => x.resolved);
    if (cards.length === 0) return null;
    return (
      <div className="mt-2 w-full space-y-2">
        {cards.map(({ r, resolved }) => {
          const item = resolved!.item;
          const imageUrl = getItemImageUrl(item);
          const categoryPart = resolved!.categorySlug
            ? `${resolved!.categorySlug}/`
            : "";
          return (
            <a
              key={r.entityId}
              href={`/${slug}/${categoryPart}${item.slug ?? item.id}`}
              className="flex w-full items-center gap-3 rounded-xl border border-border bg-card px-3 py-2.5 transition hover:border-foreground/30"
            >
              <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-md bg-muted">
                {imageUrl ? (
                  <Image
                    src={imageUrl}
                    alt={item.name}
                    fill
                    sizes="48px"
                    className="object-cover"
                  />
                ) : null}
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-semibold">
                  {item.name}
                </div>
                {r.category ? (
                  <div className="truncate text-xs text-muted-foreground">
                    {r.category}
                  </div>
                ) : null}
              </div>
              <div className="shrink-0 font-mono text-sm font-semibold tabular-nums">
                {formatPriceCents(item.price_cents, currencySettings)}
              </div>
            </a>
          );
        })}
      </div>
    );
  };

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
            messages.map((message) => {
              const parts = message.parts as Array<Record<string, unknown>>;
              const text = parts
                .filter((p) => p.type === "text")
                .map((p) => String(p.text ?? ""))
                .join("");
              const toolResults = parts
                .filter(
                  (p) =>
                    p.type === "tool-searchCatalog" &&
                    p.state === "output-available",
                )
                .flatMap((p) => {
                  const output = p.output as
                    | { results?: ToolResultItem[] }
                    | undefined;
                  return output?.results ?? [];
                });
              const searching =
                message.role === "assistant" &&
                parts.some(
                  (p) =>
                    p.type === "tool-searchCatalog" &&
                    p.state !== "output-available",
                );

              return (
                <Message from={message.role} key={message.id}>
                  {text ? (
                    <MessageContent className={ASSISTANT_BUBBLE}>
                      <MessageResponse>{text}</MessageResponse>
                    </MessageContent>
                  ) : null}
                  {searching && !text ? (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Loader size={14} />
                      Searching the catalog…
                    </div>
                  ) : null}
                  {toolResults.length > 0 ? (
                    <ProductCards results={toolResults} />
                  ) : null}
                </Message>
              );
            })
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
          <PromptInputSubmit
            status={status}
            disabled={!input.trim()}
            className="size-9 rounded-full"
          >
            {status === "ready" ? <ArrowUp className="size-4" /> : undefined}
          </PromptInputSubmit>
        </PromptInputFooter>
      </PromptInput>
    </div>
  );
}
