"use client";

/**
 * storefront-phone.tsx — the hero's centerpiece: a vertical switcher (Кафе /
 * Ресторан / Магазин) above a real Krafta storefront running live in the shared
 * iPhone mockup. Each tab swaps the iframe to a different published demo catalog,
 * so the hero shows "Krafta does *your* kind of business." Controlled: the parent
 * (LandingHero) owns the selected index so the hero's "Открыть демо" button can
 * open the same shop. CSS 3D tilt (not WebGL) keeps the iframe fully interactive;
 * the tilt tracks in the hero and holds while you use the phone. Honors
 * prefers-reduced-motion.
 *
 * iframe sizing mirrors the onboarding reveal (390px rendered, scaled to fill,
 * inset 38px below the dynamic island under IphoneStatusBar).
 */

import { useEffect, useRef, useState } from "react";

import { Iphone, IphoneStatusBar } from "@/components/ui/iphone";
import { cn } from "@/lib/utils";
import { HERO_SHOPS } from "./hero-shops";

export function StorefrontPhone({
  active,
  onSelect,
}: {
  active: number;
  onSelect: (index: number) => void;
}) {
  const shop = HERO_SHOPS[active];
  const stage = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const [motion, setMotion] = useState(true);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const apply = () => setMotion(!mq.matches);
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);

  function handleMove(e: React.MouseEvent<HTMLDivElement>) {
    if (!motion || !stage.current) return;
    const r = stage.current.getBoundingClientRect();
    setPos({
      x: (e.clientX - (r.left + r.width / 2)) / (r.width / 2),
      y: (e.clientY - (r.top + r.height / 2)) / (r.height / 2),
    });
  }

  return (
    <div className="w-full">
      <div
        role="tablist"
        aria-label="Тип бизнеса"
        className="mx-auto mb-6 flex w-fit gap-1 rounded-full border border-border bg-card p-1"
      >
        {HERO_SHOPS.map((s, i) => (
          <button
            key={s.key}
            type="button"
            role="tab"
            aria-selected={i === active}
            onClick={() => onSelect(i)}
            className={cn(
              "rounded-full px-4 py-1.5 font-mono text-xs uppercase tracking-wide transition-colors",
              i === active
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {s.label}
          </button>
        ))}
      </div>

      <div
        ref={stage}
        onMouseMove={handleMove}
        onMouseLeave={() => setPos({ x: 0, y: 0 })}
        className="relative flex min-h-[600px] w-full items-center justify-center [perspective:1200px]"
      >
        <div
          aria-hidden
          style={{ transform: `translate(${pos.x * -20}px, ${pos.y * -14}px)` }}
          className="absolute left-0 top-4 z-10 rounded-lg border border-border bg-card px-3 py-2 font-mono text-[10px] leading-tight text-foreground shadow-sm transition-transform duration-200 ease-out sm:left-2"
        >
          <div className="uppercase tracking-wider text-muted-foreground">Telegram</div>
          <div className="mt-0.5">● Новый заказ #0042</div>
        </div>

        <div
          style={{ transform: `rotateY(${pos.x * 8}deg) rotateX(${pos.y * -6}deg)` }}
          className="w-full max-w-[300px] transition-transform duration-200 ease-out"
        >
          <Iphone className="w-full">
            <div className="absolute inset-0 bg-white dark:bg-secondary-background">
              <IphoneStatusBar />
              <iframe
                key={shop.slug}
                title={`Демо Krafta — ${shop.label}`}
                src={`/${shop.slug}`}
                loading="lazy"
                className="absolute left-0 origin-top-left border-0"
                style={{ top: "38px", width: "390px", height: "780px", transform: "scale(0.692)" }}
              />
            </div>
          </Iphone>
        </div>
      </div>
    </div>
  );
}
