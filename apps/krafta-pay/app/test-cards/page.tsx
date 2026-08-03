import { ExternalLink, FlaskConical } from "lucide-react";
import { BrandWordmark } from "@/components/brand/brand-wordmark";
import { getCheckoutT } from "@/lib/locales/checkout";
import { PayLocaleProvider } from "@/lib/locales/context";
import { buttonVariants } from "@/components/ui/button-variants";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { PROVIDER_SOURCES, TEST_CARDS } from "./test-cards-data";
import { TestCardList } from "./test-card-list.client";

/**
 * Test card reference, linked from the sandbox checkout's test-mode banner.
 *
 * Public and unauthenticated on purpose: the banner it hangs off sits on the
 * hosted checkout, which has no session. Nothing here is a secret — sandbox
 * PANs move no money — but it is noindexed, because a page of card numbers in
 * search results is a bad look regardless of what they do.
 *
 * Locale follows the checkout's own resolver (`?lang=` → Accept-Language), so
 * arriving from a Russian checkout keeps you in Russian.
 */
export const metadata = {
  title: "Test cards — Krafta Pay",
  robots: { index: false, follow: false },
};

export default async function TestCardsPage({
  searchParams,
}: {
  searchParams: Promise<{ lang?: string; from?: string }>;
}) {
  const sp = await searchParams;
  const { locale, t } = await getCheckoutT({ langParam: sp.lang });

  // Only ever a same-origin checkout path — never an absolute URL from the
  // query string, which would make this an open redirect off a public page.
  const backTo =
    sp.from && /^[A-Za-z0-9_-]{8,64}$/.test(sp.from) ? `/pay/${sp.from}` : null;

  return (
    <PayLocaleProvider locale={locale}>
      <main className="min-h-dvh bg-background">
        <div className="mx-auto flex w-full max-w-2xl flex-col px-6 py-10 sm:py-16">
          <BrandWordmark text="Krafta•Pay" className="text-lg" />

          <header className="mt-10">
            <div className="flex items-center gap-2">
              <FlaskConical
                className="size-4 text-amber-600 dark:text-amber-400"
                aria-hidden
              />
              <span className="text-sm font-medium text-amber-700 dark:text-amber-400">
                {t("checkout.testBadge")}
              </span>
            </div>
            <h1 className="mt-2 text-2xl font-semibold tracking-tight">{t("testCards.title")}</h1>
            <p className="mt-1 text-sm text-muted-foreground">{t("testCards.subtitle")}</p>
          </header>

          <section className="mt-8">
            {TEST_CARDS.length > 0 ? (
              <TestCardList />
            ) : (
              // Honest rather than fabricated. Inventing plausible 8600 numbers
              // would cost a merchant an afternoon and leave them thinking our
              // integration is broken.
              <Empty className="border border-dashed">
                <EmptyHeader>
                  <EmptyMedia variant="icon">
                    <FlaskConical />
                  </EmptyMedia>
                  <EmptyTitle>{t("testCards.empty.title")}</EmptyTitle>
                  <EmptyDescription>{t("testCards.empty.description")}</EmptyDescription>
                </EmptyHeader>
              </Empty>
            )}
          </section>

          <section className="mt-8 space-y-3">
            <h2 className="text-sm font-medium">{t("testCards.where")}</h2>
            <div className="divide-y rounded-lg border">
              {PROVIDER_SOURCES.map((source) => (
                <div
                  key={source.provider}
                  className="flex flex-wrap items-center justify-between gap-3 p-4"
                >
                  <div className="min-w-0">
                    <div className="text-sm font-medium">{source.name}</div>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {t(source.hintKey as never)}
                    </p>
                  </div>
                  <a
                    href={source.url}
                    target="_blank"
                    rel="noreferrer noopener"
                    className={buttonVariants({ variant: "outline", size: "sm" })}
                  >
                    {source.name}
                    <ExternalLink className="size-3.5" />
                  </a>
                </div>
              ))}
            </div>
          </section>

          <p className="mt-8 text-xs text-muted-foreground">{t("testCards.onlyTest")}</p>

          {backTo ? (
            <a
              href={backTo}
              className="mt-6 self-start text-sm text-muted-foreground underline-offset-4 hover:underline"
            >
              ← {t("testCards.backToCheckout")}
            </a>
          ) : null}
        </div>
      </main>
    </PayLocaleProvider>
  );
}
