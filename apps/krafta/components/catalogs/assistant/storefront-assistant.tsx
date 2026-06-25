"use client";

import * as React from "react";
import Image from "next/image";
import { Sparkles, ArrowUp, X } from "lucide-react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { DialogTitle } from "@radix-ui/react-dialog";

import { Dialog, DialogClose, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ProgressiveBlur } from "@/components/ui/progressive-blur";
import { cn } from "@/lib/utils";
import type {
  PublicCategoryWithItems,
  PublicItem,
} from "@/lib/catalogs/types";
import type { CurrencySettings } from "@/lib/catalogs/settings/currency";
import { getItemImageUrl } from "@/lib/catalogs/media";
import { formatPriceCents } from "@/lib/catalogs/pricing";
import { pickLocalizedField } from "@/lib/catalogs/i18n";
import { useStorefrontLocale } from "@/lib/catalogs/storefront-locale-context";
import { useItemSheet } from "@/components/catalogs/items/item-detail-controller";

export type StorefrontAssistantProps = {
  catalogId: string;
  orgId?: string | null;
  categoriesWithItems: PublicCategoryWithItems[];
  currencySettings?: CurrencySettings;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
};

type ToolResultItem = {
  entityId: string | null;
  kind: "item" | "category";
  title: string | null;
  category: string | null;
};

const SUGGESTIONS = [
  "What do you recommend?",
  "Show me something popular",
  "I'm looking for a gift",
];

export function StorefrontAssistant({
  catalogId,
  orgId,
  categoriesWithItems,
  currencySettings,
  open = false,
  onOpenChange,
}: StorefrontAssistantProps) {
  const { openItem } = useItemSheet();
  const { activeLocale, defaultLocale } = useStorefrontLocale();
  const [input, setInput] = React.useState("");
  const scrollRef = React.useRef<HTMLDivElement>(null);
  const inputRef = React.useRef<HTMLTextAreaElement>(null);

  const transport = React.useMemo(
    () =>
      new DefaultChatTransport({
        api: "/api/shop-assistant",
        body: { catalogId, orgId: orgId ?? null },
      }),
    [catalogId, orgId],
  );

  const { messages, sendMessage, status, error } = useChat({ transport });

  const busy = status === "submitted" || status === "streaming";

  // id -> { item, categorySlug } for resolving tool results to real items
  // (image, localized name, price, slug for opening).
  const itemById = React.useMemo(() => {
    const map = new Map<
      string,
      { item: PublicItem; categorySlug: string | null }
    >();
    categoriesWithItems.forEach((category) => {
      const categorySlug = category.slug ?? String(category.id);
      category.items.forEach((item) => {
        map.set(item.id, { item, categorySlug });
      });
    });
    return map;
  }, [categoriesWithItems]);

  const localizedName = React.useCallback(
    (item: PublicItem) =>
      pickLocalizedField({
        translations: item.translations,
        defaults: {
          name: item.name,
          description: item.description,
          image_alt: item.image_alt,
        },
        activeLocale,
        defaultLocale,
        field: "name",
      }).value,
    [activeLocale, defaultLocale],
  );

  // Reset the conversation each time the dialog is freshly opened.
  React.useEffect(() => {
    if (!open) {
      setInput("");
    }
  }, [open]);

  // Autoscroll to newest content.
  React.useEffect(() => {
    if (!open) return;
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, open, busy]);

  React.useEffect(() => {
    if (!open) return;
    const id = requestAnimationFrame(() => inputRef.current?.focus());
    return () => cancelAnimationFrame(id);
  }, [open]);

  const submit = React.useCallback(
    (text: string) => {
      const value = text.trim();
      if (!value || busy) return;
      void sendMessage({ text: value });
      setInput("");
    },
    [busy, sendMessage],
  );

  const handleItemOpen = React.useCallback(
    (item: PublicItem, categorySlug: string | null) => {
      onOpenChange?.(false);
      openItem(item.slug ?? item.id, categorySlug);
    },
    [onOpenChange, openItem],
  );

  const renderResultCards = (results: ToolResultItem[]) => {
    const cards = results
      .filter((r) => r.kind === "item" && r.entityId)
      .map((r) => ({ r, resolved: itemById.get(r.entityId as string) }))
      .filter((x) => x.resolved);

    if (cards.length === 0) return null;

    return (
      <div className="-mx-1 mt-2 flex snap-x gap-2 overflow-x-auto px-1 pb-1">
        {cards.map(({ r, resolved }) => {
          const item = resolved!.item;
          const imageUrl = getItemImageUrl(item);
          const name = localizedName(item) || item.name;
          return (
            <button
              key={`${r.entityId}`}
              type="button"
              onClick={() => handleItemOpen(item, resolved!.categorySlug)}
              className="flex w-36 shrink-0 snap-start flex-col gap-2 rounded-xl border border-border bg-card p-2 text-left transition hover:border-foreground/30"
            >
              <div className="relative aspect-square w-full overflow-hidden rounded-lg bg-muted">
                {imageUrl ? (
                  <Image
                    src={imageUrl}
                    alt={name}
                    fill
                    sizes="144px"
                    className="object-cover"
                  />
                ) : null}
              </div>
              <div className="min-w-0">
                <div className="line-clamp-2 text-xs font-semibold leading-snug">
                  {name}
                </div>
                <div className="mt-1 font-mono text-xs font-semibold tabular-nums">
                  {formatPriceCents(item.price_cents, currencySettings)}
                </div>
              </div>
            </button>
          );
        })}
      </div>
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        className={cn(
          "fixed inset-0 !left-0 !top-0 z-50 h-[100dvh] w-[100dvw] !translate-x-0 !translate-y-0",
          "!max-w-none !rounded-none !border-0 !p-0",
          "bg-background",
          "data-[state=open]:animate-in data-[state=closed]:animate-out",
          "data-[state=open]:fade-in-0 data-[state=closed]:fade-out-0",
        )}
      >
        <DialogTitle className="sr-only">Shopping assistant</DialogTitle>

        <div className="relative mx-auto flex h-full w-full max-w-2xl min-h-0 flex-col">
          {/* Header */}
          <div className="flex items-center justify-between gap-3 px-4 py-3 sm:px-6">
            <div className="flex items-center gap-2">
              <Sparkles className="size-4 text-foreground" aria-hidden />
              <span className="text-sm font-semibold">Assistant</span>
            </div>
            <DialogClose asChild>
              <Button
                type="button"
                aria-label="Close assistant"
                variant="outline"
                size="icon"
                className="rounded-full"
              >
                <X className="h-4 w-4" />
              </Button>
            </DialogClose>
          </div>

          {/* Messages */}
          <div
            ref={scrollRef}
            className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 pb-28 sm:px-6"
          >
            {messages.length === 0 ? (
              <div className="flex h-full flex-col items-center justify-center gap-6 text-center">
                <div className="space-y-2">
                  <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-muted">
                    <Sparkles className="size-5" aria-hidden />
                  </div>
                  <p className="text-base font-semibold">
                    What are you looking for?
                  </p>
                  <p className="text-sm text-muted-foreground">
                    Ask in any language — I&apos;ll find it for you.
                  </p>
                </div>
                <div className="flex flex-wrap justify-center gap-2">
                  {SUGGESTIONS.map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => submit(s)}
                      className="rounded-full border border-border bg-card px-3 py-1.5 text-sm text-muted-foreground transition hover:border-foreground/30 hover:text-foreground"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
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
                  <div
                    key={message.id}
                    className={cn(
                      "flex flex-col",
                      message.role === "user" ? "items-end" : "items-start",
                    )}
                  >
                    {text ? (
                      <div
                        className={cn(
                          "max-w-[85%] whitespace-pre-wrap rounded-2xl px-3.5 py-2 text-sm",
                          message.role === "user"
                            ? "bg-foreground text-background"
                            : "bg-muted text-foreground",
                        )}
                      >
                        {text}
                      </div>
                    ) : null}
                    {searching && !text ? (
                      <div className="rounded-2xl bg-muted px-3.5 py-2 text-sm text-muted-foreground">
                        Searching…
                      </div>
                    ) : null}
                    {toolResults.length > 0 ? (
                      <div className="w-full">{renderResultCards(toolResults)}</div>
                    ) : null}
                  </div>
                );
              })
            )}

            {error ? (
              <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
                Something went wrong. Please try again.
              </div>
            ) : null}
          </div>

          {/* iOS-style progressive blur — fades messages as they reach the
              composer, replacing the hard top border. */}
          <ProgressiveBlur
            position="bottom"
            height="120px"
            blurAmount="2px"
            className="z-40"
            backgroundColor="oklch(from var(--background) l c h / 0.6)"
          />

          {/* Composer — floats over the messages, borderless. */}
          <div className="absolute inset-x-0 bottom-0 z-50 px-4 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] pt-2 sm:px-6">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                submit(input);
              }}
              className="flex items-end gap-2"
            >
              <textarea
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    submit(input);
                  }
                }}
                rows={1}
                placeholder="Ask anything…"
                className={cn(
                  "max-h-32 min-h-11 flex-1 resize-none rounded-2xl border border-border bg-background px-4 py-2.5 text-base",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
                )}
              />
              <Button
                type="submit"
                size="icon"
                className="size-11 shrink-0 rounded-full"
                disabled={!input.trim() || busy}
                aria-label="Send"
              >
                <ArrowUp className="size-5" />
              </Button>
            </form>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
