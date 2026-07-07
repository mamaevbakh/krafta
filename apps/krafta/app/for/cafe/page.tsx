import type { Metadata } from "next";
import Link from "next/link";
import { BookOpen, Languages, QrCode, Send, Smartphone, Truck } from "lucide-react";

import { Button } from "@/components/ui/button";
import { ONBOARDING_HREF } from "../../_components/landing/landing-actions";
import {
  MarketingShell,
  MarketingHero,
  MarketingCta,
} from "../../_components/marketing/marketing-shell";

export const metadata: Metadata = {
  title: "Сайт и приём заказов для кафе и кофеен — Krafta",
  description:
    "Витрина, QR-меню и приём заказов для кафе и кофеен в Узбекистане. QR на столах → заказ на кухню, самовывоз, заказы в Telegram, меню на любом языке. Бесплатный старт, без комиссии.",
  alternates: { canonical: "/for/cafe" },
};

const FEATURES = [
  {
    icon: QrCode,
    title: "QR на столах → заказ на кухню",
    body: "Гость сканирует QR за столом, выбирает и заказывает — заказ сразу у вас. Меньше беготни, больше столов за смену.",
  },
  {
    icon: BookOpen,
    title: "Самовывоз для утреннего кофе",
    body: "Заказ и оплата заранее — гость забирает готовый кофе без очереди. Идеально для потока «на вынос».",
  },
  {
    icon: Send,
    title: "Заказы прямо в Telegram",
    body: "Витрина открывается внутри Telegram, где уже сидят ваши гости. Уведомление о каждом заказе — туда же.",
  },
  {
    icon: Languages,
    title: "Меню на любом языке",
    body: "Переведите меню в один клик — гость из любой страны прочитает его на своём. Важно для туристических локаций.",
  },
  {
    icon: Truck,
    title: "Доставка внутри",
    body: "Зоны, тарифы и вызов курьера Яндекса прямо из заказа. Без сторонних приложений и комиссий агрегаторов.",
  },
  {
    icon: Smartphone,
    title: "Управление с телефона",
    body: "Меняйте меню, цены и стоп-листы и принимайте заказы откуда угодно — прямо со смартфона.",
  },
];

export default function ForCafe() {
  return (
    <MarketingShell>
      <MarketingHero
        eyebrow="Для кафе и кофеен"
        title="Витрина и приём заказов для вашего кафе"
        lede="QR-меню на столах, самовывоз и доставка — из одного меню, под вашим брендом. Начните принимать заказы уже сегодня: бесплатно, без регистрации и без комиссии с продаж."
        cta={
          <>
            <Button asChild size="lg">
              <Link href={ONBOARDING_HREF}>Создать витрину бесплатно</Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <Link href="/pricing">Посмотреть цены</Link>
            </Button>
          </>
        }
      />

      {/* Pain → outcome */}
      <section className="border-b border-border">
        <div className="mx-auto max-w-[1248px] px-6 py-16">
          <h2 className="max-w-2xl text-3xl font-semibold leading-tight tracking-tight sm:text-4xl">
            Заказы в переписках, звонках и блокноте — это не система
          </h2>
          <p className="mt-5 max-w-xl text-lg leading-relaxed text-foreground">
            Гость пишет в Telegram, звонит, спрашивает в Instagram — а заказы теряются между сообщениями. Krafta собирает всё в одном месте: одно меню, все заказы, ваш бренд.
          </p>
          <p className="mt-4 max-w-xl text-base leading-relaxed text-muted-foreground">
            И это не очередной маркетплейс: клиент остаётся вашим, а не карточкой в чужом каталоге, и вы не отдаёте процент с каждой продажи.
          </p>
        </div>
      </section>

      {/* Features grid */}
      <section className="border-b border-border bg-secondary-background">
        <div className="mx-auto max-w-[1248px] px-6 py-16">
          <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">
            Всё, что нужно кофейне
          </h2>
          <div className="mt-10 grid gap-px overflow-hidden rounded-xl border border-border bg-border sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((f) => (
              <div key={f.title} className="flex flex-col bg-card p-6">
                <f.icon className="size-5 text-muted-foreground" aria-hidden />
                <h3 className="mt-4 text-base font-medium text-foreground">{f.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                  {f.body}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="border-b border-border">
        <div className="mx-auto max-w-[1248px] px-6 py-16">
          <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">
            К вечеру вы уже принимаете заказы
          </h2>
          <ol className="mt-10 grid gap-x-8 gap-y-10 md:grid-cols-3">
            {[
              { t: "Создайте кафе", b: "Выберите тип и название. Черновик готов мгновенно — без регистрации." },
              { t: "Соберите меню", b: "Добавьте позиции, фото и цены — с переводом на любой язык." },
              { t: "Поделитесь ссылкой", b: "Отправьте ссылку или подключите Telegram — и начните принимать заказы." },
            ].map((step, i) => (
              <li key={step.t} className="border-t border-border pt-5">
                <span className="font-mono text-2xl font-medium tabular-nums text-muted-foreground">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <h3 className="mt-4 text-lg font-medium text-foreground">{step.t}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                  {step.b}
                </p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <MarketingCta
        title="Соберите витрину кафе за вечер"
        body="Бесплатно, без регистрации и без комиссии. Меняйте меню и принимайте заказы прямо с телефона."
      />
    </MarketingShell>
  );
}
