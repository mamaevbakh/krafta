"use client";

/**
 * landing-ai-conversation.tsx — the alive half of the "05 / AI" vision beat, a
 * faithful mirror of the real storefront assistant
 * (components/catalogs/assistant/storefront-assistant.tsx): Sparkles "Ассистент"
 * header, guest = dark bubble right / assistant = muted bubble left, a product
 * suggestion CARD with the item photo + price + dark "Добавить" pill, an
 * "Added" chip, and a decorative composer. A scripted conversation loops through
 * three turns — one in English (the any-language wedge, shown not told). Clearly
 * framed as roadmap by the section's СКОРО marker. Honors prefers-reduced-motion.
 */

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { ArrowUp, Check, Plus, Sparkles } from "lucide-react";

import { getItemImageUrl } from "@/lib/catalogs/media";
import { cn } from "@/lib/utils";

// Vintage Shop — a real, published Krafta demo catalog (also behind the
// hero's Магазин tab), present in both dev and prod, with real photographed
// items. Not the old vintage-coffee/Salom Coffee seed, which only existed in
// dev and rendered as broken images once this section shipped to production.
// Prices are USD (this catalog's real currency), not сум.
type Turn = {
  q: string;
  a: string;
  name: string;
  desc: string;
  price: number;
  image: string;
};

const CATALOG_ID = "c7c17254-f189-44d8-9f05-db9e54be5d9b";
const img = (item: string, media: string, file: string) =>
  `org/c03f8bd1-f6b1-4ef0-84bf-b13b0d9314a5/catalog/${CATALOG_ID}/item/${item}/media/${media}/${file}`;

const SCRIPT: Turn[] = [
  {
    q: "Есть что-то в минималистичном стиле?",
    a: "Полосатая рубашка Ann Demeulemeester — то что нужно.",
    name: "Ann Demeulemeester Striped Shirt",
    desc: "Тонкая полоска, лаконичный крой — сдержанная роскошь.",
    price: 105,
    image: img("a8f12f19-e770-4338-b8e8-bdfac18aa1e6", "70a5e3cf-b272-49f2-8de1-dba9888cb890", "ANN53056_1_enlarged.jpg"),
  },
  {
    q: "А что-то на выход?",
    a: "Босоножки Saint Laurent — лаконичные и элегантные.",
    name: "Saint Laurent Patent Sandals",
    desc: "Лаковая кожа, минималистичные ремешки — сдержанная роскошь.",
    price: 285,
    image: img("da157986-912e-4b4f-a228-755d38daf5dd", "0d05e348-609e-4966-8018-1844f37f528f", "SNT445691_1_enlarged.jpg"),
  },
  {
    q: "What's something different?",
    a: "This Off-White × Rimowa carry-on — clear PVC, pure statement.",
    name: "Off-White × Rimowa Carry-On",
    desc: "Transparent PVC carry-on — streetwear meets luxury travel.",
    price: 1425,
    image: img("89e0c8c9-aaef-4b96-8b6e-193b15492d19", "ecf5598a-5c17-48cb-9016-358f3836b42c", "OFWRI20125_1_enlarged.jpg"),
  },
];

type Msg =
  | { type: "guest"; text: string }
  | { type: "assistant"; text: string }
  | { type: "product"; turn: Turn }
  | { type: "added"; name: string };

const fmt = (n: number) =>
  n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
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
          Vintage Shop
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
                  ${fmt(t.price)}
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
