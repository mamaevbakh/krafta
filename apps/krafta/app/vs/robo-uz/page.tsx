import type { Metadata } from "next";
import Link from "next/link";
import { Check } from "lucide-react";

import { Button } from "@/components/ui/button";
import { ONBOARDING_HREF } from "../../_components/landing/landing-actions";
import {
  MarketingShell,
  MarketingHero,
  MarketingCta,
} from "../../_components/marketing/marketing-shell";
import {
  ComparisonTable,
  type CompRow,
} from "../../_components/marketing/comparison-table";

export const metadata: Metadata = {
  title: "Krafta или Robosell (robo.uz): что выбрать в 2026",
  description:
    "Честное сравнение Krafta и Robosell (robo.uz) для кафе, ресторанов и магазинов в Узбекистане. Бесплатный старт, витрина внутри Telegram, приём заказов и цены — без комиссии с продаж.",
  alternates: { canonical: "/vs/robo-uz" },
};

const ROWS: CompRow[] = [
  { label: "Бесплатный старт без регистрации", krafta: true, other: "Только пробный период" },
  { label: "Цена входа", krafta: "Бесплатно · Pro ~$20", other: "300 000 сум (~$24)" },
  { label: "Комиссия с продаж", krafta: "Нет", other: "Нет" },
  { label: "Витрина внутри Telegram (Mini App)", krafta: "Витрина", other: "Бот-канал" },
  { label: "Зал + самовывоз + доставка из одного меню", krafta: true, other: "Частично" },
  { label: "Вызов курьера Яндекса из заказа", krafta: true, other: true },
  { label: "Меню на RU / UZ / EN", krafta: true, other: true },
  { label: "Розница и не-еда", krafta: true, other: true },
  { label: "Интеграция с кассой (iiko / R-Keeper / Poster)", krafta: "Пока нет", other: true },
  { label: "Разговорный AI-приём заказов", krafta: "Скоро", other: "«ИИ» без описания" },
  { label: "Дизайн", krafta: "Витрина уровня Square", other: "Админ-конструктор" },
  { label: "Готовые кейсы и отзывы клиентов", krafta: "Скоро — мы запускаемся", other: true },
];

export default function KraftaVsRoboUz() {
  return (
    <MarketingShell>
      <MarketingHero
        eyebrow="Сравнение"
        title="Krafta или Robosell?"
        lede="Robosell (robo.uz) — сильный конструктор сайтов и Telegram-ботов. Krafta — это ваша фирменная витрина и система заказов, которая выглядит как ваш бренд, а не как админ-панель. Вот честное сравнение."
        cta={
          <Button asChild size="lg">
            <Link href={ONBOARDING_HREF}>Попробовать Krafta бесплатно</Link>
          </Button>
        }
      />

      {/* Honest framing */}
      <section className="border-b border-border">
        <div className="mx-auto grid max-w-[1248px] gap-8 px-6 py-16 md:grid-cols-2">
          <div>
            <p className="font-mono text-xs uppercase tracking-wide text-muted-foreground">
              Robosell — кому подходит
            </p>
            <p className="mt-3 text-base leading-relaxed text-foreground">
              Проверенный конструктор для HoReCa и розницы с глубокими интеграциями: касса (iiko, R-Keeper, Poster), платежи, доставка. Если у вас уже стоит POS-система и нужен универсальный конструктор с готовыми кейсами — Robosell силён.
            </p>
          </div>
          <div>
            <p className="font-mono text-xs uppercase tracking-wide text-muted-foreground">
              Krafta — кому подходит
            </p>
            <p className="mt-3 text-base leading-relaxed text-foreground">
              Фирменная витрина, которую видит клиент как ваш бренд — с приёмом заказов в зале, на самовывоз и доставку из одного меню. Бесплатный старт без регистрации, витрина прямо внутри Telegram и цена ниже входа Robosell.
            </p>
          </div>
        </div>
      </section>

      {/* Comparison table */}
      <section className="border-b border-border">
        <div className="mx-auto max-w-[1248px] px-6 py-16">
          <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">
            Krafta и Robosell по пунктам
          </h2>
          <div className="mt-8">
            <ComparisonTable otherName="Robosell" rows={ROWS} />
          </div>
        </div>
      </section>

      {/* Where Krafta wins */}
      <section className="border-b border-border bg-secondary-background">
        <div className="mx-auto max-w-[1248px] px-6 py-16">
          <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">
            Где Krafta сильнее
          </h2>
          <ul className="mt-8 grid gap-px overflow-hidden rounded-xl border border-border bg-border sm:grid-cols-2">
            {[
              {
                t: "Бесплатный старт без регистрации",
                b: "Черновик магазина готов мгновенно — без карты и без регистрации. У Robosell только пробный период.",
              },
              {
                t: "Витрина внутри Telegram, а не бот",
                b: "Ваша витрина открывается как Mini App прямо в Telegram, где уже сидят ваши клиенты. У Robosell Telegram — лишь один из каналов-ботов.",
              },
              {
                t: "Ниже цена входа",
                b: "Бесплатно на старте, Pro ~$20/мес — дешевле входного тарифа Robosell (300 000 сум ≈ $24) и без комиссии.",
              },
              {
                t: "Дизайн уровня бренда",
                b: "Витрина выглядит как ваш магазин, а не как универсальная админ-панель. Для владельца, которому важен бренд, это видно сразу.",
              },
            ].map((item) => (
              <li key={item.t} className="bg-card p-6">
                <div className="flex items-start gap-3">
                  <Check className="mt-0.5 size-5 shrink-0 text-foreground" aria-hidden />
                  <div>
                    <h3 className="text-base font-medium text-foreground">{item.t}</h3>
                    <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
                      {item.b}
                    </p>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* Where Robosell is stronger (honesty builds trust) */}
      <section className="border-b border-border">
        <div className="mx-auto max-w-[1248px] px-6 py-16">
          <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">
            Где Robosell сильнее — честно
          </h2>
          <div className="mt-8 max-w-2xl space-y-5">
            <p className="text-base leading-relaxed text-foreground">
              <span className="font-medium">Интеграция с кассой.</span>{" "}
              Robosell подключается к iiko, R-Keeper и Poster. Если у вас уже стоит одна из этих POS-систем, это реальный плюс — Krafta пока не интегрируется с кассами.
            </p>
            <p className="text-base leading-relaxed text-foreground">
              <span className="font-medium">Готовые кейсы и отзывы.</span>{" "}
              У Robosell есть публичные логотипы клиентов и отзывы. Krafta только запускается — публичных кейсов пока нет, поэтому первые заведения мы подключаем лично и на особых условиях.
            </p>
          </div>
        </div>
      </section>

      <MarketingCta
        title="Соберите свою витрину за вечер"
        body="Бесплатно, без регистрации. Посмотрите, как ваш магазин будет выглядеть в Krafta — и решайте сами."
      />
    </MarketingShell>
  );
}
