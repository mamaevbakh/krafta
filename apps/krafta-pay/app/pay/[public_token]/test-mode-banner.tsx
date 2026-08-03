import { ArrowUpRight, FlaskConical } from "lucide-react";
import type { TranslateFn } from "@/lib/locales/messages";
import type { PayLocale } from "@/lib/locales/locale";

/**
 * Test-mode banner for the hosted checkout.
 *
 * Rendered ONLY when the checkout's environment is `test`, and deliberately
 * absent in live — a badge that appears on every page teaches people to stop
 * reading it, and a real customer paying real money should see nothing but the
 * amount and the card fields.
 *
 * Who actually sees this: the merchant, testing their own integration. The
 * thing they need to know in one glance is that no money moves — otherwise the
 * only way to find out is to check their bank, which is exactly the anxiety
 * this removes.
 *
 * Amber rather than destructive red: this is an advisory about which rails are
 * in play, not a failure. It matches the dashboard sidebar's test pill so the
 * two surfaces agree about what "test" looks like.
 */
export function TestModeBanner({
  t,
  locale,
  /** Public token, so the reference page can offer a link straight back. */
  publicToken,
}: {
  t: TranslateFn;
  locale?: PayLocale;
  publicToken?: string;
}) {
  // Carry the language across so a Russian checkout does not hand you an
  // English reference page, and the token so the page can offer a way back.
  const params = new URLSearchParams();
  if (locale) params.set("lang", locale);
  if (publicToken) params.set("from", publicToken);
  const href = params.size > 0 ? `/test-cards?${params}` : "/test-cards";
  return (
    <div className="mb-8 flex items-start gap-2.5 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2.5">
      <FlaskConical
        className="mt-0.5 size-4 shrink-0 text-amber-600 dark:text-amber-400"
        aria-hidden
      />
      <div className="min-w-0">
        <div className="text-sm font-medium text-amber-700 dark:text-amber-400">
          {t("checkout.testBadge")}
        </div>
        <p className="mt-0.5 text-xs leading-snug text-amber-700/80 dark:text-amber-400/80">
          {t("checkout.testHint")}
        </p>
        <a
          href={href}
          target="_blank"
          rel="noreferrer noopener"
          className="mt-1.5 inline-flex items-center gap-1 text-xs font-medium text-amber-700 underline-offset-4 hover:underline dark:text-amber-400"
        >
          {t("checkout.testCardsLink")}
          <ArrowUpRight className="size-3" aria-hidden />
        </a>
      </div>
    </div>
  );
}
