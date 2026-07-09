import type { Metadata } from "next";
import Link from "next/link";
import { Check, Minus } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ONBOARDING_HREF } from "../_components/landing/landing-actions";
import {
  MarketingShell,
  MarketingHero,
  MarketingCta,
} from "../_components/marketing/marketing-shell";

export const metadata: Metadata = {
  title: "Цены Krafta — бесплатный старт, Pro и Business без комиссии",
  description:
    "Бесплатный тариф навсегда, Pro за 250 000 сум/мес и Business за 490 000 сум/мес. Фиксированная плата, без комиссии с продаж. Витрина, заказы, QR и доставка для кафе, ресторанов и магазинов Узбекистана.",
  alternates: { canonical: "/pricing" },
};

type Tier = {
  name: string;
  tagline: string;
  price: string;
  period: string;
  priceNote?: string;
  highlighted?: boolean;
  badge?: string;
  cta: string;
  features: string[];
};

const TIERS: Tier[] = [
  {
    name: "Бесплатно",
    tagline: "Будьте онлайн уже сегодня",
    price: "0",
    period: "навсегда",
    cta: "Начать бесплатно",
    features: [
      "Витрина и меню на любом языке",
      "QR-код на меню и ссылка на магазин",
      "Заказы прямо в Telegram + уведомления",
      "Самовывоз, заявка на доставку, каталог для просмотра",
      "Управление с телефона",
    ],
  },
  {
    name: "Pro",
    tagline: "Принимайте заказы",
    price: "250 000",
    period: "сум / мес",
    priceNote: "≈ $20 · без комиссии с продаж",
    highlighted: true,
    badge: "Популярный",
    cta: "Начать с Pro",
    features: [
      "Всё из Бесплатного, плюс:",
      "Оплата картой — Krafta Pay",
      "Доставка — зоны, тарифы и вызов курьера Яндекса",
      "Все заказы на одном экране",
      "Базовая аналитика",
    ],
  },
  {
    name: "Business",
    tagline: "Управляйте всем заведением",
    price: "490 000",
    period: "сум / мес",
    priceNote: "≈ $39 · без комиссии с продаж",
    cta: "Выбрать Business",
    features: [
      "Всё из Pro, плюс:",
      "Зал — QR на столах → на кухню",
      "Несколько заведений и роли команды",
      "Расширенная аналитика и отчёты",
      "Приоритетная поддержка",
      "AI-ассистент заказов (скоро)",
    ],
  },
];

type Row = { label: string; free: Cell; pro: Cell; business: Cell };
type Cell = boolean | string;

const MATRIX: { group: string; rows: Row[] }[] = [
  {
    group: "Основа",
    rows: [
      { label: "Количество заведений", free: "1", pro: "1", business: "Несколько" },
      { label: "Витрина и меню (RU / UZ / EN)", free: true, pro: true, business: true },
      { label: "QR-код на меню и ссылка на магазин", free: true, pro: true, business: true },
      { label: "Управление с телефона", free: true, pro: true, business: true },
    ],
  },
  {
    group: "Заказы",
    rows: [
      { label: "Заказы в Telegram + уведомления", free: "Базово", pro: "Расширенно", business: "Расширенно" },
      { label: "Самовывоз · заявка на доставку · каталог", free: true, pro: true, business: true },
      { label: "Оплата картой — Krafta Pay (онлайн)", free: false, pro: true, business: true },
      { label: "Доставка — зоны, тарифы, курьер Яндекса", free: false, pro: true, business: true },
      { label: "Все заказы на одном экране", free: false, pro: true, business: true },
      { label: "Зал — QR на столах → на кухню", free: false, pro: false, business: true },
    ],
  },
  {
    group: "Управление и рост",
    rows: [
      { label: "Аналитика", free: false, pro: "Базовая", business: "Расширенная + отчёты" },
      { label: "Несколько заведений", free: false, pro: false, business: true },
      { label: "Роли и права команды", free: false, pro: false, business: true },
      { label: "Приоритетная поддержка", free: false, pro: false, business: true },
    ],
  },
  {
    group: "Скоро",
    rows: [
      { label: "Оплата картой за столом (в зале)", free: false, pro: false, business: "Скоро" },
      { label: "AI-ассистент заказов", free: false, pro: false, business: "Скоро" },
      { label: "Промокоды и лояльность", free: false, pro: false, business: "Скоро" },
    ],
  },
];

const FAQ = [
  {
    q: "Вы берёте процент с продаж?",
    a: "Нет. Krafta — это фиксированная плата в месяц, а не комиссия с каждого заказа. Сколько бы вы ни продавали, цена одна.",
  },
  {
    q: "Что входит в бесплатный тариф?",
    a: "Настоящая витрина с меню на любом языке, QR-код, ссылка на магазин, приём заказов через Telegram и самовывоз — всё, чтобы начать принимать заказы уже сегодня. Без карты, без регистрации.",
  },
  {
    q: "Чем Pro отличается от Business?",
    a: "Pro — это полная система для одного заведения: приём оплаты картой, доставка с вызовом курьера и все заказы на одном экране. Business добавляет зал (QR на столах → на кухню), несколько заведений, роли команды, расширенную аналитику и приоритетную поддержку, а также AI-ассистента.",
  },
  {
    q: "Можно ли платить за год?",
    a: "Да. При оплате за год — 2 месяца в подарок (≈ 17% экономии).",
  },
  {
    q: "Как принимать оплату?",
    a: "Наличными в заведении и картой онлайн через Krafta Pay (тарифы Pro и Business) — с фиксированной платой, а не процентом с продаж. Приём карт за столом в зале появится скоро.",
  },
];

export default function PricingPage() {
  return (
    <MarketingShell>
      <MarketingHero
        eyebrow="Цены"
        title="Фиксированная цена. Без комиссии с продаж."
        lede="Начните бесплатно и платите по мере роста — одна цена в месяц, сколько бы вы ни продавали. Никаких процентов с каждого заказа."
        cta={
          <>
            <Button asChild size="lg">
              <Link href={ONBOARDING_HREF}>Создать магазин бесплатно</Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <Link href="#compare">Сравнить тарифы</Link>
            </Button>
          </>
        }
      />

      {/* Tier cards */}
      <section className="border-b border-border">
        <div className="mx-auto max-w-[1248px] px-6 py-16">
          <div className="grid items-stretch gap-6 lg:grid-cols-3">
            {TIERS.map((tier) => (
              <div
                key={tier.name}
                className={cn(
                  "flex flex-col rounded-xl border bg-card p-8",
                  tier.highlighted ? "border-2 border-foreground" : "border-border",
                )}
              >
                <div className="flex items-center gap-3">
                  <p
                    className={cn(
                      "text-sm font-medium",
                      tier.highlighted ? "text-foreground" : "text-muted-foreground",
                    )}
                  >
                    {tier.name}
                  </p>
                  {tier.badge ? (
                    <Badge variant="secondary">{tier.badge}</Badge>
                  ) : null}
                </div>
                <p className="mt-1 text-sm text-muted-foreground">{tier.tagline}</p>

                <div className="mt-4 flex items-baseline gap-2">
                  <span className="font-mono text-4xl font-semibold tabular-nums tracking-tight text-foreground">
                    {tier.price}
                  </span>
                  <span className="text-sm text-muted-foreground">{tier.period}</span>
                </div>
                {tier.priceNote ? (
                  <p className="mt-1 text-xs text-muted-foreground">{tier.priceNote}</p>
                ) : null}

                <ul className="mt-6 flex-1 space-y-3">
                  {tier.features.map((f, i) => (
                    <li key={f} className="flex items-start gap-3">
                      {i === 0 && f.endsWith("плюс:") ? (
                        <span className="text-sm font-medium text-foreground">{f}</span>
                      ) : (
                        <>
                          <Check className="mt-0.5 size-4 shrink-0 text-foreground" aria-hidden />
                          <span className="text-sm text-foreground">{f}</span>
                        </>
                      )}
                    </li>
                  ))}
                </ul>

                <Button
                  asChild
                  size="lg"
                  variant={tier.highlighted ? "default" : "outline"}
                  className="mt-8 w-full"
                >
                  <Link href={ONBOARDING_HREF}>{tier.cta}</Link>
                </Button>
              </div>
            ))}
          </div>
          <p className="mt-6 text-sm text-muted-foreground">
            При оплате за год — 2 месяца в подарок. Цены показаны в сумах, без скрытых платежей и комиссий с продаж.
          </p>
        </div>
      </section>

      {/* Comparison matrix */}
      <section id="compare" className="scroll-mt-16 border-b border-border">
        <div className="mx-auto max-w-[1248px] px-6 py-16">
          <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">
            Что входит в каждый тариф
          </h2>
          <div className="mt-8 overflow-x-auto">
            <table className="w-full min-w-[640px] border-collapse text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="py-3 pr-4 text-left font-medium text-muted-foreground">
                    Возможность
                  </th>
                  <th className="px-4 py-3 text-center font-medium">Бесплатно</th>
                  <th className="px-4 py-3 text-center font-medium">Pro</th>
                  <th className="px-4 py-3 text-center font-medium">Business</th>
                </tr>
              </thead>
              <tbody>
                {MATRIX.map((section) => (
                  <FragmentRows key={section.group} group={section.group} rows={section.rows} />
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* Founding offer */}
      <section className="border-b border-border bg-secondary-background">
        <div className="mx-auto max-w-[1248px] px-6 py-16">
          <div className="rounded-xl border border-dashed border-border bg-card p-8 sm:p-10">
            <p className="font-mono text-xs uppercase tracking-wide text-muted-foreground">
              Для первых заведений
            </p>
            <h2 className="mt-3 max-w-2xl text-2xl font-semibold tracking-tight sm:text-3xl">
              Первые заведения получают Business по цене Pro — навсегда
            </h2>
            <p className="mt-4 max-w-2xl text-base leading-relaxed text-muted-foreground">
              Мы подключаем первые заведения лично: бесплатно соберём ваше меню по фотографиям и настроим витрину. Взамен — ваш отзыв и возможность рассказать о вашем опыте. Функции Business остаются у вас по цене Pro навсегда.
            </p>
            <Button asChild size="lg" className="mt-6">
              <Link href={ONBOARDING_HREF}>Стать одним из первых</Link>
            </Button>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="border-b border-border">
        <div className="mx-auto max-w-[1248px] px-6 py-16">
          <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">
            Частые вопросы
          </h2>
          <div className="mt-8 max-w-3xl divide-y divide-border">
            {FAQ.map((item) => (
              <div key={item.q} className="py-5">
                <h3 className="text-base font-medium text-foreground">{item.q}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                  {item.a}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <MarketingCta
        title="Начните принимать заказы уже сегодня"
        body="Бесплатно, без карты и без регистрации. Платите, только когда захотите большего."
      />
    </MarketingShell>
  );
}

function FragmentRows({ group, rows }: { group: string; rows: Row[] }) {
  return (
    <>
      <tr>
        <td colSpan={4} className="pt-6 pb-2">
          <span className="font-mono text-xs uppercase tracking-wide text-muted-foreground">
            {group}
          </span>
        </td>
      </tr>
      {rows.map((row) => (
        <tr key={row.label} className="border-b border-border">
          <td className="py-3 pr-4 text-foreground">{row.label}</td>
          <MatrixCell value={row.free} />
          <MatrixCell value={row.pro} />
          <MatrixCell value={row.business} />
        </tr>
      ))}
    </>
  );
}

function MatrixCell({ value }: { value: Cell }) {
  return (
    <td className="px-4 py-3 text-center">
      {value === true ? (
        <Check className="mx-auto size-4 text-foreground" aria-hidden />
      ) : value === false ? (
        <Minus className="mx-auto size-4 text-muted-foreground/50" aria-hidden />
      ) : (
        <span className="text-xs text-muted-foreground">{value}</span>
      )}
    </td>
  );
}
