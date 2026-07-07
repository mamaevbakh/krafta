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
  title: "Krafta или laCafe (lacafe.uz): что выбрать в 2026",
  description:
    "Честное сравнение Krafta и laCafe для кафе и ресторанов в Узбекистане. Бесплатный старт и ~$20/мес против $100/мес и демо с консультантом — без комиссии с продаж.",
  alternates: { canonical: "/vs/lacafe" },
};

const ROWS: CompRow[] = [
  { label: "Бесплатный старт без регистрации", krafta: true, other: "Демо по заявке" },
  { label: "Цена входа", krafta: "Бесплатно · Pro ~$20", other: "$100/мес + $50/филиал" },
  { label: "Комиссия с продаж", krafta: "Нет", other: "Нет" },
  { label: "Скорость запуска", krafta: "Заказы уже сегодня", other: "Демо и консультант" },
  { label: "Витрина внутри Telegram (Mini App)", krafta: "Витрина", other: "Бот" },
  { label: "Зал + самовывоз + доставка из одного меню", krafta: true, other: "Доставка в первую очередь" },
  { label: "Своя служба доставки (курьеры, диспетчер, колл-центр)", krafta: false, other: true },
  { label: "Заказы из агрегаторов в одном окне (Wolt / Uzum Tezkor / Yandex Eats)", krafta: false, other: true },
  { label: "Розница и не-еда (магазины, шоурумы)", krafta: true, other: false },
  { label: "Разговорный AI-приём заказов", krafta: "Скоро", other: false },
  { label: "Мобильные приложения iOS / Android", krafta: "Веб + Telegram", other: "Да (платно)" },
];

export default function KraftaVsLacafe() {
  return (
    <MarketingShell>
      <MarketingHero
        eyebrow="Сравнение"
        title="Krafta или laCafe?"
        lede="laCafe — мощная платформа доставки для сетей ресторанов: свои курьеры, колл-центр, заказы из агрегаторов в одном окне. Krafta — для отдельного заведения, которое хочет начать принимать заказы уже сегодня, бесплатно. Вот честное сравнение."
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
              laCafe — кому подходит
            </p>
            <p className="mt-3 text-base leading-relaxed text-foreground">
              Сеть ресторанов с большим объёмом доставки и собственными курьерами. laCafe даёт диспетчерскую, колл-центр и сбор заказов из Wolt, Uzum Tezkor и Yandex Eats в одном окне. Это операционная платформа доставки для нескольких филиалов — и она в этом сильна.
            </p>
          </div>
          <div>
            <p className="font-mono text-xs uppercase tracking-wide text-muted-foreground">
              Krafta — кому подходит
            </p>
            <p className="mt-3 text-base leading-relaxed text-foreground">
              Отдельное кафе, ресторан или магазин, который хочет свою витрину, приём заказов в зале, на самовывоз и доставку — и начать сегодня, бесплатно, без консультанта. За цену в 5 раз ниже входного тарифа laCafe.
            </p>
          </div>
        </div>
      </section>

      {/* Comparison table */}
      <section className="border-b border-border">
        <div className="mx-auto max-w-[1248px] px-6 py-16">
          <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">
            Krafta и laCafe по пунктам
          </h2>
          <div className="mt-8">
            <ComparisonTable otherName="laCafe" rows={ROWS} />
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
                t: "Начните сегодня, бесплатно",
                b: "Черновик витрины готов мгновенно — без карты, без регистрации, без демо с консультантом. У laCafe вход — заявка и звонок менеджера.",
              },
              {
                t: "В 5 раз дешевле на входе",
                b: "Бесплатно на старте, Pro ~$20/мес против $100/мес + $50 за филиал у laCafe. Для одного заведения разница огромная.",
              },
              {
                t: "Не только рестораны",
                b: "Krafta работает и для магазинов, шоурумов и услуг — с настоящими вариантами и модификаторами. laCafe — только для кафе и ресторанов.",
              },
              {
                t: "Одна витрина — все заказы",
                b: "Зал, самовывоз и доставка из одного меню. laCafe в первую очередь про доставку; зал и витрина — вторичны.",
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

      {/* Where laCafe is stronger */}
      <section className="border-b border-border">
        <div className="mx-auto max-w-[1248px] px-6 py-16">
          <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">
            Где laCafe сильнее — честно
          </h2>
          <div className="mt-8 max-w-2xl space-y-5">
            <p className="text-base leading-relaxed text-foreground">
              <span className="font-medium">Своя служба доставки.</span>{" "}
              laCafe даёт приложение для курьеров, диспетчерскую панель и колл-центр. Если у вас свой штат курьеров и большой поток доставки — это настоящая операционная система, которой у Krafta пока нет.
            </p>
            <p className="text-base leading-relaxed text-foreground">
              <span className="font-medium">Заказы из агрегаторов.</span>{" "}
              laCafe собирает заказы из Wolt, Uzum Tezkor и Yandex Eats в одно окно. Если большая часть ваших заказов приходит из этих сервисов, это экономит время. Krafta пока не подключает агрегаторы.
            </p>
            <p className="text-base leading-relaxed text-foreground">
              <span className="font-medium">Проверенная платформа.</span>{" "}
              laCafe — с инвестициями и ~100 заведениями на платформе. Krafta только запускается: первые заведения мы подключаем лично и на особых условиях.
            </p>
          </div>
        </div>
      </section>

      <MarketingCta
        title="Начните с бесплатной витрины"
        body="Если у вас одно заведение и вы хотите начать сегодня, а не после демо — попробуйте Krafta. Бесплатно, без регистрации."
      />
    </MarketingShell>
  );
}
