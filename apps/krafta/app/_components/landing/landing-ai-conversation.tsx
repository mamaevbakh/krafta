"use client";

/**
 * landing-ai-conversation.tsx — the alive half of the "05 / AI" vision beat, a
 * faithful mirror of the real storefront assistant
 * (components/catalogs/assistant/storefront-assistant.tsx): Sparkles "Ассистент"
 * header, guest = dark bubble right / assistant = muted bubble left, a product
 * suggestion CARD with the item photo + сум price + dark "Добавить" pill, an
 * "Added" chip, and a decorative composer. A scripted conversation loops through
 * three turns — one in English (the any-language wedge, shown not told). Clearly
 * framed as roadmap by the section's СКОРО marker. Honors prefers-reduced-motion.
 */

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { ArrowUp, Check, Plus, Sparkles } from "lucide-react";

import { getItemImageUrl } from "@/lib/catalogs/media";
import { cn } from "@/lib/utils";

const CID = "c0ffee00-0000-4000-8000-000000000001";
const img = (item: string, media: string, file: string) =>
  `org/c03f8bd1-f6b1-4ef0-84bf-b13b0d9314a5/catalog/${CID}/item/${item}/media/${media}/${file}`;

type Turn = {
  q: string;
  a: string;
  name: string;
  desc: string;
  price: number;
  image: string;
};

const SCRIPT: Turn[] = [
  {
    q: "Что-нибудь без лактозы?",
    a: "Есть — овсяный латте на овсяном молоке.",
    name: "Овсяный латте",
    desc: "Латте на овсяном молоке — мягкий и без лактозы.",
    price: 32000,
    image: img("c0ffee00-0000-4000-8000-000000010002", "c0ffee00-0000-4000-8000-000000030002", "oat-latte.jpg"),
  },
  {
    q: "Что взять к кофе?",
    a: "Возьмите круассан — печём каждое утро.",
    name: "Круассан",
    desc: "Слоёный масляный круассан.",
    price: 22000,
    image: img("c0ffee00-0000-4000-8000-000000010006", "c0ffee00-0000-4000-8000-000000030006", "croissant.jpg"),
  },
  {
    q: "What do you recommend?",
    a: "Our cappuccino — a local favourite.",
    name: "Капучино",
    desc: "Классический капучино на эспрессо-бленде.",
    price: 28000,
    image: img("c0ffee00-0000-4000-8000-000000010001", "c0ffee00-0000-4000-8000-000000030001", "cappuccino.jpg"),
  },
];

type Msg =
  | { type: "guest"; text: string }
  | { type: "assistant"; text: string }
  | { type: "product"; turn: Turn }
  | { type: "added"; name: string };

const fmt = (n: number) => n.toLocaleString("en-US");
const anim = "animate-in fade-in slide-in-from-bottom-1 duration-300";

export function LandingAiConversation() {
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const timers = useRef<number[]>([]);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (mq.matches) {
      const t = SCRIPT[0];
      setMsgs([
        { type: "guest", text: t.q },
        { type: "assistant", text: t.a },
        { type: "product", turn: t },
        { type: "added", name: t.name },
      ]);
      return;
    }

    let i = 0;
    const later = (fn: () => void, ms: number) =>
      timers.current.push(window.setTimeout(fn, ms));

    function play() {
      const t = SCRIPT[i % SCRIPT.length];
      setMsgs([]);
      later(() => setMsgs([{ type: "guest", text: t.q }]), 450);
      later(() => setMsgs((m) => [...m, { type: "assistant", text: "…" }]), 1250);
      later(
        () =>
          setMsgs((m) =>
            m.map((x, idx) => (idx === 1 ? { type: "assistant", text: t.a } : x)),
          ),
        2150,
      );
      later(() => setMsgs((m) => [...m, { type: "product", turn: t }]), 2900);
      later(() => setMsgs((m) => [...m, { type: "added", name: t.name }]), 4600);
      later(() => {
        i += 1;
        play();
      }, 6600);
    }
    play();

    return () => {
      timers.current.forEach(clearTimeout);
      timers.current = [];
    };
  }, []);

  return (
    <div className="flex flex-col rounded-2xl border border-border bg-card">
      <div className="flex items-center gap-2 border-b border-border px-4 py-3">
        <Sparkles className="size-4 text-foreground" aria-hidden />
        <span className="text-sm font-semibold">Ассистент</span>
        <span className="ml-auto font-mono text-[10px] uppercase tracking-wide text-muted-foreground">
          Salom Coffee
        </span>
      </div>

      <div className="flex h-[540px] flex-col justify-end gap-2.5 overflow-hidden px-4 py-4">
        {msgs.map((m, i) => {
          if (m.type === "guest") {
            return (
              <div
                key={i}
                className={cn("max-w-[85%] self-end rounded-2xl bg-foreground px-3.5 py-2 text-sm text-background", anim)}
              >
                {m.text}
              </div>
            );
          }
          if (m.type === "assistant") {
            return (
              <div
                key={i}
                className={cn("max-w-[85%] self-start rounded-2xl bg-muted px-3.5 py-2 text-sm text-foreground", anim)}
              >
                {m.text}
              </div>
            );
          }
          if (m.type === "added") {
            return (
              <div
                key={i}
                className={cn("inline-flex items-center gap-2 self-start rounded-full border border-border bg-card px-3 py-1.5 text-sm", anim)}
              >
                <Check className="size-4" aria-hidden />
                Добавлено: {m.name}
              </div>
            );
          }
          const t = m.turn;
          return (
            <div
              key={i}
              className={cn("w-full max-w-[280px] self-start rounded-2xl border border-border bg-card p-2", anim)}
            >
              <div className="relative aspect-[4/3] w-full overflow-hidden rounded-xl bg-muted">
                <Image
                  src={getItemImageUrl({ image_path: t.image }) ?? ""}
                  alt={t.name}
                  fill
                  sizes="280px"
                  className="object-cover"
                />
              </div>
              <div className="mt-2 space-y-1 px-1">
                <div className="text-sm font-semibold leading-snug">{t.name}</div>
                <p className="line-clamp-2 text-xs leading-snug text-muted-foreground">
                  {t.desc}
                </p>
                <div className="font-mono text-sm font-semibold tabular-nums">
                  {fmt(t.price)} сум
                </div>
              </div>
              <div className="mt-2 px-1 pb-1">
                <span className="inline-flex w-full items-center justify-center gap-1.5 rounded-full border border-foreground bg-foreground px-4 py-2 text-sm font-semibold text-background">
                  <Plus className="size-4" />
                  Добавить
                </span>
              </div>
            </div>
          );
        })}
      </div>

      <div className="flex items-center gap-2 border-t border-border p-3">
        <div className="flex-1 rounded-full border border-border px-4 py-2 text-sm text-muted-foreground">
          Спросите что угодно…
        </div>
        <span className="grid size-9 shrink-0 place-items-center rounded-full bg-primary text-primary-foreground">
          <ArrowUp className="size-4" />
        </span>
      </div>
    </div>
  );
}
