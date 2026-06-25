"use client";

import * as React from "react";
import Image from "next/image";
import {
  Sparkles,
  ArrowUp,
  X,
  Check,
  Plus,
  Minus,
  Trash2,
  ShoppingBag,
} from "lucide-react";
import { useChat } from "@ai-sdk/react";
import {
  DefaultChatTransport,
  lastAssistantMessageIsCompleteWithToolCalls,
} from "ai";
import { DialogTitle } from "@radix-ui/react-dialog";

import { Dialog, DialogClose, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ProgressiveBlur } from "@/components/ui/progressive-blur";
import { cn } from "@/lib/utils";
import type {
  PublicCategoryWithItems,
  PublicItem,
} from "@/lib/catalogs/types";
import {
  normalizeCurrencySettings,
  type CurrencySettings,
} from "@/lib/catalogs/settings/currency";
import { getItemImageUrl } from "@/lib/catalogs/media";
import { formatPriceCents } from "@/lib/catalogs/pricing";
import { pickLocalizedField } from "@/lib/catalogs/i18n";
import { useStorefrontLocale } from "@/lib/catalogs/storefront-locale-context";
import {
  getStorefrontMessage,
  type StorefrontMessageKey,
} from "@/lib/locales/messages";
import { useItemSheet } from "@/components/catalogs/items/item-detail-controller";
import { PricingBreakdown } from "@/components/catalogs/cart/pricing-breakdown";
import { CheckoutWidget } from "@/components/catalogs/assistant/checkout-widget";
import { useOptionalCart } from "@/components/catalogs/cart/cart-provider";

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

type ClientToolCall = { toolCallId: string; toolName: string; input?: unknown };
type ClientToolDeps = {
  cart: ReturnType<typeof useOptionalCart>;
  itemById: Map<string, { item: PublicItem; categorySlug: string | null }>;
  /** Open the ORIGINAL full item-detail sheet (closes the assistant; it
   *  reopens when the sheet closes — see handleItemOpen). */
  openItemSheet: (item: PublicItem, categorySlug: string | null) => void;
  /** Open the inline cart panel. */
  openCart: () => void;
  /** Open the inline guided checkout. */
  startCheckout: () => void;
  onClose: () => void;
  displayName: (item: PublicItem) => string;
  addToolResult: (args: {
    tool: string;
    toolCallId: string;
    output: unknown;
  }) => Promise<void> | void;
};

// Handles the CLIENT-side agent tools (no server execute). Resolves the item
// the model named, mutates the live cart context, or opens the item sheet, then
// reports a structured result so the model can confirm.
async function runClientTool(call: ClientToolCall, deps: ClientToolDeps | null) {
  if (!deps) return;
  // Await the result so it's committed before onToolCall resolves (the SDK
  // awaits onToolCall; an uncommitted result is treated as unhandled).
  const add = (output: unknown) =>
    deps.addToolResult({
      tool: call.toolName,
      toolCallId: call.toolCallId,
      output,
    });
  try {
    if (call.toolName === "addToCart") {
      const { itemId, quantity } = (call.input ?? {}) as {
        itemId?: string;
        quantity?: number;
      };
      const resolved = itemId ? deps.itemById.get(itemId) : undefined;
      if (!resolved) return add({ ok: false, reason: "not_found" });
      const { item, categorySlug } = resolved;
      if (!deps.cart) {
        return add({ ok: false, reason: "cart_unavailable" });
      }
      // Complex = needs choices (modifiers or >1 variation) → open the full
      // item-detail sheet so the shopper picks; never guess options. Simple
      // items add straight (below).
      const complex =
        (item.modifier_lists?.length ?? 0) > 0 ||
        (item.variations?.length ?? 0) > 1;
      if (complex) {
        deps.openItemSheet(item, categorySlug);
        return add({
          ok: false,
          reason: "needs_options",
          opened: true,
          name: deps.displayName(item),
        });
      }
      const defaultVariationId =
        item.variations?.find((v) => v.is_default)?.id ??
        item.variations?.[0]?.id;
      await deps.cart.addItem({
        itemId: item.id,
        defaultVariationId,
        name: item.name,
        basePriceCents: item.price_cents,
        quantity: quantity ?? 1,
      });
      return add({
        ok: true,
        added: { name: deps.displayName(item), quantity: quantity ?? 1 },
      });
    }

    if (call.toolName === "viewCart") {
      deps.openCart();
      const summary = deps.cart?.summary;
      if (!summary)
        return add({
          ok: false,
          reason: "cart_unavailable",
          lines: [],
          subtotalCents: 0,
        });
      return add({
        ok: true,
        count: summary.lineItems.length,
        subtotalCents: summary.subtotalCents,
        lines: summary.lineItems.map((l) => ({
          name: l.name,
          variation: l.variation_name,
          quantity: l.quantity,
          totalCents: l.total_price_cents,
        })),
      });
    }

    if (call.toolName === "openItem") {
      const { itemId } = (call.input ?? {}) as { itemId?: string };
      const resolved = itemId ? deps.itemById.get(itemId) : undefined;
      if (!resolved) return add({ ok: false, reason: "not_found" });
      deps.openItemSheet(resolved.item, resolved.categorySlug);
      return add({ ok: true, opened: deps.displayName(resolved.item) });
    }

    if (call.toolName === "checkout") {
      if (!deps.cart || deps.cart.summary.lineItems.length === 0) {
        return add({ ok: false, reason: "empty_cart" });
      }
      deps.startCheckout();
      return add({ ok: true, opened: true });
    }
  } catch {
    add({ ok: false, reason: "error" });
  }
}

export function StorefrontAssistant({
  catalogId,
  orgId,
  categoriesWithItems,
  currencySettings,
  open = false,
  onOpenChange,
}: StorefrontAssistantProps) {
  const itemSheet = useItemSheet();
  const cart = useOptionalCart();
  const { activeLocale, defaultLocale } = useStorefrontLocale();
  // Localized widget chrome — follows the storefront's active locale, falling
  // back to the catalog default then English. The model's prose replies still
  // follow the shopper's message language (handled server-side).
  const t = React.useCallback(
    (key: StorefrontMessageKey) =>
      getStorefrontMessage(key, { activeLocale, defaultLocale }),
    [activeLocale, defaultLocale],
  );
  // Concrete currency for the shared PricingBreakdown (which requires it).
  const currency = React.useMemo(
    () => currencySettings ?? normalizeCurrencySettings({}),
    [currencySettings],
  );
  const [input, setInput] = React.useState("");
  const scrollRef = React.useRef<HTMLDivElement>(null);
  const inputRef = React.useRef<HTMLTextAreaElement>(null);

  // Inline cart + checkout panels.
  const [cartOpen, setCartOpen] = React.useState(false);
  const [checkoutOpen, setCheckoutOpen] = React.useState(false);

  // Reopen the assistant after the (original) item-detail sheet closes, so
  // tapping a configurable item → sheet → close lands the shopper back in the
  // conversation. The dock keeps this component mounted, so the refs persist
  // across the assistant's own open/close.
  const reopenAfterSheetRef = React.useRef(false);
  const prevSheetOpenRef = React.useRef(false);
  React.useEffect(() => {
    const was = prevSheetOpenRef.current;
    prevSheetOpenRef.current = itemSheet.isOpen;
    if (was && !itemSheet.isOpen && reopenAfterSheetRef.current) {
      reopenAfterSheetRef.current = false;
      onOpenChange?.(true);
    }
  }, [itemSheet.isOpen, onOpenChange]);

  const transport = React.useMemo(
    () =>
      new DefaultChatTransport({
        api: "/api/shop-assistant",
        body: { catalogId, orgId: orgId ?? null },
      }),
    [catalogId, orgId],
  );

  // The (stable) client-tool handler reads live deps through this ref (assigned
  // every render below). Client tool calls are resolved in a post-commit effect
  // (see below) — NOT in onToolCall, which fires mid-stream and whose result
  // gets clobbered when the stream commits the final message.
  const toolDepsRef = React.useRef<ClientToolDeps | null>(null);
  const handledToolCalls = React.useRef<Set<string>>(new Set());

  const { messages, sendMessage, status, error, addToolResult } = useChat({
    transport,
    // After a client tool result is added, send it back so the model produces
    // its final reply (e.g. "Added 2 lattes ✓").
    sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithToolCalls,
  });

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
  const localizedDescription = React.useCallback(
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
        field: "description",
      }).value || null,
    [activeLocale, defaultLocale],
  );

  // Keep the client-tool handler's deps current (it reads toolDepsRef.current).
  toolDepsRef.current = {
    cart,
    itemById,
    openItemSheet: (item, categorySlug) => handleItemOpen(item, categorySlug),
    openCart: () => setCartOpen(true),
    startCheckout: () => setCheckoutOpen(true),
    onClose: () => onOpenChange?.(false),
    displayName: (item) => localizedName(item) || item.name,
    addToolResult: addToolResult as unknown as ClientToolDeps["addToolResult"],
  };

  // Resolve client-side tool calls AFTER the stream commits the message
  // (status "ready"). Running them mid-stream via onToolCall gets clobbered by
  // the final message commit, leaving the call stuck "input-available".
  React.useEffect(() => {
    if (status !== "ready") return;
    const last = messages[messages.length - 1];
    if (!last || last.role !== "assistant") return;
    const CLIENT = new Set(["addToCart", "viewCart", "openItem", "checkout"]);
    for (const part of last.parts as Array<Record<string, unknown>>) {
      const type = String(part.type ?? "");
      if (!type.startsWith("tool-")) continue;
      const name = type.slice("tool-".length);
      if (!CLIENT.has(name) || part.state !== "input-available") continue;
      const id = String(part.toolCallId ?? "");
      if (!id || handledToolCalls.current.has(id)) continue;
      handledToolCalls.current.add(id);
      void runClientTool(
        { toolCallId: id, toolName: name, input: part.input },
        toolDepsRef.current,
      );
    }
  }, [messages, status]);

  // Reset the conversation each time the dialog is freshly opened.
  React.useEffect(() => {
    if (!open) {
      setInput("");
      setCartOpen(false);
      setCheckoutOpen(false);
    }
  }, [open]);

  // Autoscroll to newest content.
  React.useEffect(() => {
    if (!open) return;
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, open, busy, cartOpen, checkoutOpen]);

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

  // Open the ORIGINAL full item-detail sheet. Close the assistant so the sheet
  // gets the full screen; the effect above reopens the assistant when the
  // sheet closes, for a seamless return to the conversation.
  const handleItemOpen = React.useCallback(
    (item: PublicItem, categorySlug: string | null) => {
      reopenAfterSheetRef.current = true;
      onOpenChange?.(false);
      itemSheet.openItem(item.slug ?? item.id, categorySlug);
    },
    [itemSheet, onOpenChange],
  );

  // Simple = no modifiers and ≤1 variation → safe to one-tap add/step from the
  // assistant. Complex items open the item sheet to pick options.
  const isSimpleItem = (item: PublicItem) =>
    (item.modifier_lists?.length ?? 0) === 0 &&
    (item.variations?.length ?? 0) <= 1;
  // The single un-modified cart line for an item (drives the inline stepper).
  const lineForItem = (itemId: string) =>
    cart?.summary.lineItems.find(
      (l) => l.catalog_item_id === itemId && l.modifiers.length === 0,
    ) ?? null;
  const addSimple = (item: PublicItem) => {
    if (!cart) return;
    void cart.addItem({
      itemId: item.id,
      defaultVariationId:
        item.variations?.find((v) => v.is_default)?.id ??
        item.variations?.[0]?.id,
      name: item.name,
      basePriceCents: item.price_cents,
      quantity: 1,
    });
  };

  // Compact −/qty/+ stepper used on product cards and cart lines.
  const Stepper = ({
    qty,
    onDec,
    onInc,
    decIcon,
  }: {
    qty: number;
    onDec: () => void;
    onInc: () => void;
    decIcon?: React.ReactNode;
  }) => (
    <div className="inline-flex items-center gap-1 rounded-full border border-border bg-background">
      <button
        type="button"
        onClick={onDec}
        aria-label="Decrease"
        className="grid size-7 place-items-center rounded-full text-foreground transition hover:bg-muted"
      >
        {decIcon ?? <Minus className="size-3.5" />}
      </button>
      <span className="min-w-4 text-center text-sm font-semibold tabular-nums">
        {qty}
      </span>
      <button
        type="button"
        onClick={onInc}
        aria-label="Increase"
        className="grid size-7 place-items-center rounded-full text-foreground transition hover:bg-muted"
      >
        <Plus className="size-3.5" />
      </button>
    </div>
  );

  // Build the muted "options" line for a cart row: variation + selected
  // modifiers (text-mode shows its value; qty>1 shows ×N).
  const cartOptionLine = (line: {
    variation_name: string | null;
    modifiers: Array<{
      name: string;
      quantity: number;
      text_value: string | null;
    }>;
  }) =>
    [
      // Drop the implicit single-variation label ("Default") — it's noise.
      line.variation_name &&
      line.variation_name.trim().toLowerCase() !== "default"
        ? line.variation_name
        : null,
      ...line.modifiers.map((m) =>
        m.text_value
          ? `${m.name}: ${m.text_value}`
          : m.quantity > 1
            ? `${m.name} ×${m.quantity}`
            : m.name,
      ),
    ]
      .filter(Boolean)
      .join(" · ");

  // The ChatKit-style cart widget — live & editable. Thumbnail + options line
  // + line price, with the −/qty/+ stepper on the RIGHT; then the shared
  // price breakdown; then Оформить заказ / Keep shopping.
  const renderCart = () => {
    if (!cart || cart.summary.lineItems.length === 0) {
      return (
        <div className="mt-2 w-full max-w-md rounded-2xl border border-border bg-card px-4 py-3">
          <div className="text-sm font-medium">{t("cart.empty")}</div>
          <div className="mt-0.5 text-xs text-muted-foreground">
            {t("cart.empty.hint")}
          </div>
        </div>
      );
    }
    return (
      <div className="mt-2 w-full max-w-md rounded-2xl border border-border bg-card p-3">
        <div className="space-y-3">
          {cart.summary.lineItems.map((l) => {
            const opts = cartOptionLine(l);
            return (
              <div key={l.id} className="flex items-start gap-3">
                <div className="relative size-12 shrink-0 overflow-hidden rounded-md bg-muted">
                  {l.image_url ? (
                    <Image
                      src={l.image_url}
                      alt={l.name}
                      fill
                      sizes="48px"
                      className="object-cover"
                    />
                  ) : null}
                </div>
                <div className="min-w-0 flex-1 pt-0.5">
                  <div className="truncate text-sm font-medium">{l.name}</div>
                  {opts ? (
                    <div className="truncate text-xs text-muted-foreground">
                      {opts}
                    </div>
                  ) : null}
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1.5">
                  <Stepper
                    qty={l.quantity}
                    decIcon={
                      l.quantity <= 1 ? (
                        <Trash2 className="size-3.5" />
                      ) : undefined
                    }
                    onDec={() =>
                      l.quantity <= 1
                        ? void cart.removeItem(l.id)
                        : cart.bumpQuantity(l.id, -1)
                    }
                    onInc={() => cart.bumpQuantity(l.id, 1)}
                  />
                  <div className="font-mono text-sm font-semibold tabular-nums">
                    {formatPriceCents(l.total_price_cents, currency)}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <div className="mt-3 border-t border-border pt-3">
          <PricingBreakdown
            subtotalCents={cart.summary.subtotalCents}
            taxes={cart.taxes}
            tipCents={cart.tipCents}
            currencySettings={currency}
          />
        </div>

        <div className="mt-3 space-y-2">
          <button
            type="button"
            onClick={() => {
              setCartOpen(false);
              setCheckoutOpen(true);
            }}
            className="w-full rounded-full bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition hover:opacity-90"
          >
            {t("checkout.place_order")}
          </button>
          <button
            type="button"
            onClick={() => setCartOpen(false)}
            className="w-full rounded-full border border-border px-4 py-2.5 text-sm font-medium transition hover:border-foreground/30"
          >
            {t("cart.keep_shopping")}
          </button>
        </div>
      </div>
    );
  };

  const renderResultCards = (results: ToolResultItem[]) => {
    const cards = results
      .filter((r) => r.kind === "item" && r.entityId)
      .map((r) => ({ r, resolved: itemById.get(r.entityId as string) }))
      .filter((x) => x.resolved);

    if (cards.length === 0) return null;

    return (
      <div className="mt-2 space-y-2">
        <div className="-mx-1 flex snap-x gap-2 overflow-x-auto px-1 pb-1">
          {cards.map(({ r, resolved }) => {
            const item = resolved!.item;
            const categorySlug = resolved!.categorySlug;
            const imageUrl = getItemImageUrl(item);
            const name = localizedName(item) || item.name;
            const description = localizedDescription(item);
            const line = lineForItem(item.id);
            const simple = isSimpleItem(item);
            // Tapping the card adds simple items straight; complex items open
            // the original full item-detail sheet to choose options.
            const onItemClick = () =>
              simple ? addSimple(item) : handleItemOpen(item, categorySlug);
            return (
              <div
                key={`${r.entityId}`}
                className="flex w-72 max-w-[82%] shrink-0 snap-start flex-col gap-2 rounded-2xl border border-border bg-card p-2"
              >
                <button
                  type="button"
                  onClick={() => handleItemOpen(item, categorySlug)}
                  className="text-left"
                >
                  <div className="relative aspect-[4/3] w-full overflow-hidden rounded-xl bg-muted">
                    {imageUrl ? (
                      <Image
                        src={imageUrl}
                        alt={name}
                        fill
                        sizes="288px"
                        className="object-cover"
                      />
                    ) : null}
                  </div>
                  <div className="mt-2 space-y-1 px-1">
                    <div className="line-clamp-1 text-sm font-semibold leading-snug">
                      {name}
                    </div>
                    {description ? (
                      <p className="line-clamp-2 text-xs leading-snug text-muted-foreground">
                        {description}
                      </p>
                    ) : null}
                    <div className="font-mono text-sm font-semibold tabular-nums">
                      {formatPriceCents(item.price_cents, currency)}
                    </div>
                  </div>
                </button>
                <div className="mt-auto space-y-1.5 px-1 pb-1">
                  {line && simple ? (
                    <>
                      {/* Full-width quantity stepper: − left, qty centre, + right. */}
                      <div className="flex w-full items-center justify-between rounded-full border border-border p-1">
                        <button
                          type="button"
                          aria-label={line.quantity <= 1 ? "Remove" : "Decrease"}
                          onClick={() =>
                            line.quantity <= 1
                              ? void cart?.removeItem(line.id)
                              : cart?.bumpQuantity(line.id, -1)
                          }
                          className="grid size-9 place-items-center rounded-full text-foreground transition hover:bg-muted"
                        >
                          {line.quantity <= 1 ? (
                            <Trash2 className="size-4" />
                          ) : (
                            <Minus className="size-4" />
                          )}
                        </button>
                        <span className="text-sm font-semibold tabular-nums">
                          {line.quantity}
                        </span>
                        <button
                          type="button"
                          aria-label="Increase"
                          onClick={() => cart?.bumpQuantity(line.id, 1)}
                          className="grid size-9 place-items-center rounded-full text-foreground transition hover:bg-muted"
                        >
                          <Plus className="size-4" />
                        </button>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleItemOpen(item, categorySlug)}
                        className="w-full rounded-full border border-border px-4 py-2 text-sm font-medium transition hover:border-foreground/30"
                      >
                        {t("add_to_cart.view_item")}
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      disabled={!cart}
                      onClick={onItemClick}
                      className="inline-flex w-full items-center justify-center gap-1.5 rounded-full border border-foreground bg-foreground px-4 py-2 text-sm font-semibold text-background transition hover:opacity-90 disabled:opacity-40"
                    >
                      {simple ? (
                        <>
                          <Plus className="size-4" />
                          {t("add_to_cart.label")}
                        </>
                      ) : (
                        t("add_to_cart.choose_options")
                      )}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {cart && cart.itemCount > 0 ? (
          <button
            type="button"
            onClick={() => setCartOpen(true)}
            className="inline-flex w-full items-center justify-center gap-2 rounded-full border border-border px-4 py-2 text-sm font-medium transition hover:border-foreground/30"
          >
            <ShoppingBag className="size-4" />
            {t("add_to_cart.view")}
            <span className="text-muted-foreground">·</span>
            <span className="font-mono tabular-nums">
              {formatPriceCents(cart.summary.subtotalCents, currency)}
            </span>
          </button>
        ) : null}
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

        <div className="relative mx-auto flex h-full w-full min-w-0 max-w-2xl min-h-0 flex-col">
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
            className="min-h-0 w-full min-w-0 flex-1 space-y-4 overflow-x-hidden overflow-y-auto px-4 pb-28 sm:px-6"
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
                // addToCart resolves client-side — render its result as a chip
                // for instant confirmation. (viewCart opens the cart panel
                // below instead of rendering inline here.)
                const cartActions = parts
                  .filter(
                    (p) =>
                      p.type === "tool-addToCart" &&
                      p.state === "output-available",
                  )
                  .map((p) => ({
                    kind: String(p.type),
                    output: (p.output ?? {}) as Record<string, unknown>,
                  }));

                return (
                  <div
                    key={message.id}
                    className={cn(
                      "flex w-full min-w-0 flex-col",
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
                    {cartActions.map((a, i) => {
                      const o = a.output;
                      if (a.kind === "tool-addToCart") {
                        if (o.ok && o.added) {
                          const added = o.added as {
                            name?: string;
                            quantity?: number;
                          };
                          return (
                            <div
                              key={`ca-${i}`}
                              className="mt-2 inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1.5 text-sm"
                            >
                              <Check className="size-4" aria-hidden />
                              Added{" "}
                              {added.quantity && added.quantity > 1
                                ? `${added.quantity}× `
                                : ""}
                              {added.name} to cart
                            </div>
                          );
                        }
                        if (o.opened) {
                          return (
                            <div
                              key={`ca-${i}`}
                              className="mt-2 inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1.5 text-sm text-muted-foreground"
                            >
                              Opened {String(o.name ?? "the item")} — choose
                              options to add
                            </div>
                          );
                        }
                        return null;
                      }
                      return null;
                    })}
                  </div>
                );
              })
            )}

            {error ? (
              <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
                Something went wrong. Please try again.
              </div>
            ) : null}

            {/* Cart — inline panel, opened by the View-cart button or the
                viewCart tool. Hidden while checkout is open. */}
            {cartOpen && !checkoutOpen && cart ? (
              <div className="w-full">{renderCart()}</div>
            ) : null}

            {/* Guided checkout — inline card in the conversation. */}
            {checkoutOpen && cart ? (
              <CheckoutWidget
                currency={currency}
                onClose={() => setCheckoutOpen(false)}
                onEditCart={() => {
                  setCheckoutOpen(false);
                  setCartOpen(true);
                }}
              />
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
