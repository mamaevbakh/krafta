import Link from "next/link";
import { ArrowLeft, CreditCard, Plus, RefreshCw } from "lucide-react";

import { createAdminSupabase } from "@/lib/supabase-admin";
import { resolveActiveCustomerPortalSession } from "@/lib/customer-portal";
import { formatMinorAmount } from "@/lib/format";
import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button-variants";
import { BrandWordmark } from "@/components/brand/brand-wordmark";
import { PortalThemeToggle } from "./_theme-toggle.client";
import {
  getPortalStrings,
  invoiceStatusMeta,
  localeTag,
  resolvePortalLocale,
  subStatusMeta,
  type PortalLocale,
} from "./_strings";

// ---------------------------------------------------------------------------
// Formatting helpers
// ---------------------------------------------------------------------------

function fmtLongDate(value: string | null | undefined, locale: PortalLocale) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat(localeTag(locale), {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
}

function fmtShortDate(value: string | null | undefined, locale: PortalLocale) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat(localeTag(locale), {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
}

function money(amountMinor: number | null | undefined, currency: string | null | undefined) {
  return formatMinorAmount(amountMinor ?? 0, (currency || "UZS").toUpperCase());
}

function titleCase(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1).toLowerCase();
}

function getPendingPlanChange(metadata: unknown): { planId: string; effectiveAt: string | null } | null {
  if (!metadata || typeof metadata !== "object") return null;
  const pending = (metadata as Record<string, unknown>).pending_plan_change;
  if (!pending || typeof pending !== "object") return null;
  const planId = (pending as Record<string, unknown>).plan_id;
  if (typeof planId !== "string") return null;
  const effectiveAt = (pending as Record<string, unknown>).effective_at;
  return { planId, effectiveAt: typeof effectiveAt === "string" ? effectiveAt : null };
}

// ---------------------------------------------------------------------------
// Presentational pieces
// ---------------------------------------------------------------------------

type StatusTone = "success" | "warning" | "destructive" | "muted";

const TONE_CLASS: Record<StatusTone, string> = {
  success: "bg-success/10 text-success dark:bg-success/15",
  warning: "bg-warning/10 text-warning dark:bg-warning/15",
  destructive: "bg-destructive/10 text-destructive dark:bg-destructive/20",
  muted: "bg-muted text-muted-foreground",
};

function StatusPill({ label, tone }: { label: string; tone: StatusTone }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap",
        TONE_CLASS[tone],
      )}
    >
      <span className="size-1.5 rounded-full bg-current opacity-80" aria-hidden />
      {label}
    </span>
  );
}

function CardBrandMark({ brand }: { brand: string | null | undefined }) {
  const b = String(brand ?? "").toLowerCase();
  if (b.includes("visa")) {
    return (
      <div className="flex h-[22px] w-8 shrink-0 items-center justify-center rounded bg-[#1434CB] text-[8px] font-bold tracking-tight text-white italic">
        VISA
      </div>
    );
  }
  if (b.includes("master") || b.includes("mc")) {
    return (
      <div className="flex h-[22px] w-8 shrink-0 items-center justify-center rounded border border-border bg-background">
        <span className="size-2.5 rounded-full bg-[#EB001B]" />
        <span className="-ml-1 size-2.5 rounded-full bg-[#F79E1B]/90" />
      </div>
    );
  }
  return (
    <div className="flex h-[22px] w-8 shrink-0 items-center justify-center rounded bg-muted text-muted-foreground">
      <CreditCard className="size-3.5" />
    </div>
  );
}

function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="text-xs font-medium tracking-wider text-muted-foreground uppercase">
      {children}
    </h2>
  );
}

const summaryButton =
  "cursor-pointer list-none select-none [&::-webkit-details-marker]:hidden";

// ---------------------------------------------------------------------------
// Success / error banners (localized inline; ru primary, en fallback)
// ---------------------------------------------------------------------------

function bannerMessage(
  kind: "success" | "error",
  code: string,
  locale: PortalLocale,
): string {
  const ru: Record<string, string> = {
    "s:cancel_at_period_end_set": "Подписка будет отменена в конце текущего оплаченного периода.",
    "s:already_canceled": "Подписка уже отменена.",
    "s:payment_method_updated": "Способ оплаты обновлён.",
    "s:plan_updated": "Тариф изменён.",
    "s:plan_update_scheduled": "Смена тарифа запланирована на следующее продление.",
    "s:plan_unchanged": "Вы уже на этом тарифе.",
    "e:subscription_not_found": "Подписка не найдена.",
    "e:expired": "Срок действия ссылки истёк. Откройте портал заново из приложения.",
    "e:payment_method_update_canceled": "Обновление карты отменено.",
    "e:invalid_plan_update_request": "Не удалось изменить тариф.",
    "e:plan_not_found": "Тариф недоступен.",
  };
  const en: Record<string, string> = {
    "s:cancel_at_period_end_set": "Your subscription will cancel at the end of the current paid period.",
    "s:already_canceled": "Subscription is already canceled.",
    "s:payment_method_updated": "Payment method updated.",
    "s:plan_updated": "Plan changed.",
    "s:plan_update_scheduled": "Plan change scheduled for your next renewal.",
    "s:plan_unchanged": "You are already on this plan.",
    "e:subscription_not_found": "Subscription not found.",
    "e:expired": "This link has expired. Open the portal again from the app.",
    "e:payment_method_update_canceled": "Card update was canceled.",
    "e:invalid_plan_update_request": "Could not change the plan.",
    "e:plan_not_found": "Plan unavailable.",
  };
  const uz: Record<string, string> = {
    "s:cancel_at_period_end_set": "Obuna joriy to‘langan davr oxirida bekor qilinadi.",
    "s:already_canceled": "Obuna allaqachon bekor qilingan.",
    "s:payment_method_updated": "To‘lov usuli yangilandi.",
    "s:plan_updated": "Tarif o‘zgartirildi.",
    "s:plan_update_scheduled": "Tarifni o‘zgartirish keyingi uzaytirishga rejalashtirildi.",
    "s:plan_unchanged": "Siz allaqachon shu tarifdasiz.",
    "e:subscription_not_found": "Obuna topilmadi.",
    "e:expired": "Havolaning muddati tugagan. Ilovadan portalni qayta oching.",
    "e:payment_method_update_canceled": "Kartani yangilash bekor qilindi.",
    "e:invalid_plan_update_request": "Tarifni o‘zgartirib bo‘lmadi.",
    "e:plan_not_found": "Tarif mavjud emas.",
  };
  const map = locale === "en" ? en : locale === "uz" ? uz : ru;
  const key = `${kind === "success" ? "s" : "e"}:${code}`;
  if (map[key]) return map[key];
  if (kind === "success") return code;
  if (locale === "en") return "Could not complete the action. Please try again.";
  if (locale === "uz") return "Amalni bajarib bo‘lmadi. Qayta urinib ko‘ring.";
  return "Не удалось выполнить действие. Попробуйте ещё раз.";
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default async function CustomerPortalPage({
  params,
  searchParams,
}: {
  params: Promise<{ session_token: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { session_token } = await params;
  const query = await searchParams;
  const pick = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  const successParam = pick(query.success);
  const errorParam = pick(query.error);
  const langParam = pick(query.lang);

  const supabase = createAdminSupabase();
  const portal = await resolveActiveCustomerPortalSession(supabase, session_token);

  if (!portal.ok) {
    const locale = resolvePortalLocale(langParam);
    const s = getPortalStrings(locale);
    return (
      <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center px-6 text-center">
        <h1 className="text-lg font-semibold">{s.sessionUnavailableTitle}</h1>
        <p className="mt-2 text-sm text-muted-foreground">{s.sessionUnavailableBody}</p>
      </main>
    );
  }

  const session = portal.session;
  const sessionMeta =
    session.metadata && typeof session.metadata === "object"
      ? (session.metadata as Record<string, unknown>)
      : {};
  const locale = resolvePortalLocale(
    langParam ?? (typeof sessionMeta.locale === "string" ? sessionMeta.locale : null),
  );
  const s = getPortalStrings(locale);
  const brandName =
    typeof sessionMeta.brand_name === "string" && sessionMeta.brand_name.trim()
      ? sessionMeta.brand_name.trim()
      : "Krafta";

  const [customerRes, subscriptionsRes, paymentMethodsRes] = await Promise.all([
    supabase
      .schema("payments")
      .from("customers")
      .select("id, email, phone")
      .eq("id", session.customer_id)
      .maybeSingle(),
    supabase
      .schema("payments")
      .from("subscriptions")
      .select(
        "id, status, plan_id, cancel_at_period_end, current_period_start, current_period_end, created_at, updated_at, metadata",
      )
      .eq("org_id", session.org_id)
      .eq("customer_id", session.customer_id)
      .order("updated_at", { ascending: false })
      .order("created_at", { ascending: false }),
    supabase
      .schema("payments")
      .from("payment_methods")
      .select("id, provider_id, brand, last4, exp_month, exp_year, type, status, is_default, created_at")
      .eq("customer_id", session.customer_id)
      .order("is_default", { ascending: false })
      .order("created_at", { ascending: false }),
  ]);
  if (customerRes.error) throw customerRes.error;
  if (subscriptionsRes.error) throw subscriptionsRes.error;
  if (paymentMethodsRes.error) throw paymentMethodsRes.error;

  const subscriptions = subscriptionsRes.data ?? [];
  const paymentMethods = paymentMethodsRes.data ?? [];
  const planIds = Array.from(new Set(subscriptions.map((r) => r.plan_id).filter(Boolean)));

  const [plansRes, availablePlansRes, invoicesRes] = await Promise.all([
    planIds.length
      ? supabase
          .schema("payments")
          .from("plans")
          .select("id, name, amount_minor, currency, interval_count")
          .in("id", planIds)
      : Promise.resolve({ data: [], error: null } as { data: unknown[]; error: null }),
    supabase
      .schema("payments")
      .from("plans")
      .select("id, name, amount_minor, currency, interval_count, is_active")
      .eq("org_id", session.org_id)
      .eq("is_active", true)
      .order("amount_minor", { ascending: true }),
    subscriptions.length
      ? supabase
          .schema("payments")
          .from("invoices")
          .select("id, subscription_id, status, amount_due_minor, currency, created_at")
          .in("subscription_id", subscriptions.map((r) => r.id))
          .order("created_at", { ascending: false })
          .limit(24)
      : Promise.resolve({ data: [], error: null } as { data: unknown[]; error: null }),
  ]);
  if (plansRes.error) throw plansRes.error;
  if (availablePlansRes.error) throw availablePlansRes.error;
  if (invoicesRes.error) throw invoicesRes.error;

  type PlanRow = {
    id: string;
    name: string | null;
    amount_minor: number;
    currency: string;
    interval_count: number | null;
    is_active?: boolean;
  };
  const plans = (plansRes.data ?? []) as PlanRow[];
  const availablePlans = (availablePlansRes.data ?? []) as PlanRow[];
  const invoices = (invoicesRes.data ?? []) as Array<{
    id: string;
    subscription_id: string;
    status: string;
    amount_due_minor: number;
    currency: string;
    created_at: string;
  }>;
  const plansById = new Map(plans.map((p) => [p.id, p]));
  const availableById = new Map(availablePlans.map((p) => [p.id, p]));
  const subPlanName = new Map(subscriptions.map((sub) => [sub.id, plansById.get(sub.plan_id)?.name ?? "—"]));

  const highlightedSubscriptionId =
    session.flow_data && typeof session.flow_data === "object"
      ? (session.flow_data as Record<string, unknown>).subscriptionId
      : null;
  const primarySubId = subscriptions[0]?.id ?? null;
  const customer = customerRes.data;
  const contactLine = customer?.email || customer?.phone || null;

  const intervalLabel = (n: number | null | undefined) =>
    !n || n === 1 ? s.perMonth : s.perMonths(n);

  return (
    <div className="min-h-screen bg-background lg:grid lg:grid-cols-[minmax(300px,360px)_1fr]">
      {/* ---- Desktop brand rail (persistent dark surface) ---- */}
      <aside className="hidden bg-neutral-950 text-neutral-100 lg:block dark:bg-black">
        <div className="sticky top-0 flex min-h-screen flex-col px-9 py-10">
          <div className="flex items-center gap-2.5">
            <span className="flex size-8 items-center justify-center rounded-md bg-white text-sm font-bold text-black">
              K
            </span>
            <BrandWordmark text={brandName} className="text-lg text-white dark:text-white" />
          </div>
          <p className="mt-7 max-w-[26ch] text-sm leading-relaxed text-neutral-400">
            {s.trust(brandName)}
          </p>
          {session.return_url ? (
            <Link
              href={String(session.return_url)}
              className="mt-7 -ml-2.5 inline-flex w-fit items-center gap-2 rounded-md px-2.5 py-2 text-sm font-medium text-neutral-100 transition-colors hover:bg-white/5"
            >
              <ArrowLeft className="size-4" />
              {s.backTo(brandName)}
            </Link>
          ) : null}
          <div className="flex-1" />
          <p className="border-t border-white/10 pt-6 text-xs leading-relaxed text-neutral-500">
            {s.processedBy}
            <span className="px-1.5 opacity-50">·</span>
            {s.terms}
            <span className="px-1.5 opacity-50">·</span>
            {s.privacy}
          </p>
        </div>
      </aside>

      <div className="flex flex-col">
        {/* ---- Mobile top bar ---- */}
        <div className="flex items-center justify-between gap-3 bg-neutral-950 px-4 py-3 text-neutral-100 lg:hidden dark:bg-black">
          <div className="flex items-center gap-2">
            <span className="flex size-6 items-center justify-center rounded bg-white text-xs font-bold text-black">
              K
            </span>
            <BrandWordmark text={brandName} className="text-sm text-white dark:text-white" />
          </div>
          {session.return_url ? (
            <Link
              href={String(session.return_url)}
              className="inline-flex items-center gap-1.5 text-sm font-medium text-neutral-200"
            >
              <ArrowLeft className="size-4" />
              {s.backShort}
            </Link>
          ) : null}
        </div>

        {/* ---- Content ---- */}
        <main className="px-5 py-8 sm:px-8 lg:px-12 lg:py-12">
          <div className="mx-auto flex w-full max-w-[560px] flex-col gap-10">
            <header className="flex items-start justify-between gap-4">
              <div>
                <h1 className="text-2xl font-semibold tracking-tight text-balance">
                  {s.pageTitle}
                </h1>
                {contactLine ? (
                  <p className="mt-1 text-sm text-muted-foreground">{contactLine}</p>
                ) : null}
              </div>
              <PortalThemeToggle label={s.themeToggle} />
            </header>

            {successParam ? (
              <div className={cn("rounded-lg px-4 py-3 text-sm", TONE_CLASS.success)}>
                {bannerMessage("success", successParam, locale)}
              </div>
            ) : null}
            {errorParam ? (
              <div className={cn("rounded-lg px-4 py-3 text-sm", TONE_CLASS.destructive)}>
                {bannerMessage("error", errorParam, locale)}
              </div>
            ) : null}

            {/* ============ Current subscription ============ */}
            <section className="flex flex-col gap-5">
              <Eyebrow>{s.currentSubscription}</Eyebrow>
              {subscriptions.length === 0 ? (
                <p className="text-sm text-muted-foreground">{s.noSubscriptions}</p>
              ) : (
                subscriptions.map((sub) => {
                  const plan = plansById.get(sub.plan_id);
                  const statusMeta = subStatusMeta(sub.status, locale);
                  const nextBilling = fmtLongDate(sub.current_period_end, locale);
                  const pending = getPendingPlanChange(sub.metadata);
                  const pendingPlan = pending ? availableById.get(pending.planId) : null;
                  const canManage = sub.status !== "canceled" && sub.status !== "cancelled";
                  const isHighlighted = highlightedSubscriptionId === sub.id;
                  const defaultCard = paymentMethods.find((pm) => pm.is_default) ?? paymentMethods[0];

                  return (
                    <div
                      key={sub.id}
                      className={cn(
                        "flex flex-col gap-3",
                        isHighlighted && "-mx-3 rounded-lg px-3 py-3 ring-1 ring-ring",
                      )}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <h3 className="text-lg font-semibold">{plan?.name ?? "—"}</h3>
                        <StatusPill label={statusMeta.label} tone={statusMeta.tone} />
                      </div>

                      {plan ? (
                        <div className="flex items-baseline gap-2">
                          <span className="font-mono text-2xl font-semibold tabular-nums">
                            {money(plan.amount_minor, plan.currency)}
                          </span>
                          <span className="text-sm text-muted-foreground">
                            / {intervalLabel(plan.interval_count)}
                          </span>
                        </div>
                      ) : null}

                      <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
                        <RefreshCw className="size-3.5" />
                        {s.autoRenew}
                      </p>

                      {plan ? (
                        <details className="group">
                          <summary
                            className={cn(
                              summaryButton,
                              "inline-flex w-fit items-center gap-1 text-sm font-medium text-foreground",
                            )}
                          >
                            <span className="text-muted-foreground transition-transform group-open:rotate-90">
                              ›
                            </span>
                            {s.showDetails}
                          </summary>
                          <dl className="mt-3 divide-y divide-border border-t border-border">
                            <div className="flex items-center justify-between gap-4 py-2.5">
                              <dt className="text-sm text-muted-foreground">{s.planAmount}</dt>
                              <dd className="font-mono text-sm tabular-nums">
                                {money(plan.amount_minor, plan.currency)} / {intervalLabel(plan.interval_count)}
                              </dd>
                            </div>
                            {fmtLongDate(sub.current_period_start, locale) && nextBilling ? (
                              <div className="flex items-center justify-between gap-4 py-2.5">
                                <dt className="text-sm text-muted-foreground">{s.currentPeriod}</dt>
                                <dd className="text-sm">
                                  {fmtLongDate(sub.current_period_start, locale)} — {nextBilling}
                                </dd>
                              </div>
                            ) : null}
                            {fmtLongDate(sub.created_at, locale) ? (
                              <div className="flex items-center justify-between gap-4 py-2.5">
                                <dt className="text-sm text-muted-foreground">{s.subscriptionSince}</dt>
                                <dd className="text-sm">{fmtLongDate(sub.created_at, locale)}</dd>
                              </div>
                            ) : null}
                          </dl>
                        </details>
                      ) : null}

                      {nextBilling ? (
                        <p className="text-sm text-muted-foreground">
                          {s.nextBilling}:{" "}
                          <span className="font-medium text-foreground">{nextBilling}</span>
                        </p>
                      ) : null}

                      {sub.cancel_at_period_end && nextBilling ? (
                        <p className={cn("rounded-md px-3 py-2 text-sm", TONE_CLASS.warning)}>
                          {s.cancelScheduled(nextBilling)}
                        </p>
                      ) : null}
                      {pending ? (
                        <p className={cn("rounded-md px-3 py-2 text-sm", TONE_CLASS.warning)}>
                          {s.pendingPlanChange(
                            pendingPlan?.name ?? pending.planId,
                            (pending.effectiveAt === "period_end" && nextBilling) || fmtLongDate(pending.effectiveAt, locale) || "",
                          )}
                        </p>
                      ) : null}

                      {defaultCard ? (
                        <div className="flex items-center gap-2.5 border-t border-border pt-3 text-sm">
                          <CardBrandMark brand={defaultCard.brand ?? defaultCard.provider_id} />
                          <span className="font-medium">
                            {defaultCard.brand ? titleCase(defaultCard.brand) : titleCase(defaultCard.provider_id)}
                            {defaultCard.last4 ? (
                              <span className="ml-1.5 font-mono tabular-nums text-muted-foreground">
                                •••• {defaultCard.last4}
                              </span>
                            ) : null}
                          </span>
                        </div>
                      ) : null}

                      {canManage ? (
                        <div className="flex flex-col gap-2 pt-1">
                          {availablePlans.length > 0 ? (
                            <details className="group">
                              <summary
                                className={cn(
                                  buttonVariants({ variant: "outline", size: "sm" }),
                                  summaryButton,
                                  "w-fit",
                                )}
                              >
                                {s.changePlan}
                              </summary>
                              <form
                                method="post"
                                action={`/portal/${encodeURIComponent(session_token)}/subscriptions/${encodeURIComponent(sub.id)}/update`}
                                className="mt-3 flex max-w-sm flex-col gap-3 rounded-lg border border-border p-3"
                              >
                                <label className="flex flex-col gap-1 text-sm">
                                  <span className="text-xs text-muted-foreground">{s.changePlanTo}</span>
                                  <select
                                    name="planId"
                                    defaultValue={pending?.planId ?? sub.plan_id}
                                    className="h-9 rounded-md border border-input bg-background px-3 text-sm"
                                  >
                                    {availablePlans.map((p) => (
                                      <option key={p.id} value={p.id}>
                                        {p.name ?? "—"} · {money(p.amount_minor, p.currency)} / {intervalLabel(p.interval_count)}
                                      </option>
                                    ))}
                                  </select>
                                </label>
                                <label className="flex flex-col gap-1 text-sm">
                                  <span className="text-xs text-muted-foreground">{s.whenApply}</span>
                                  <select
                                    name="prorationBehavior"
                                    defaultValue="defer_to_period_end"
                                    className="h-9 rounded-md border border-input bg-background px-3 text-sm"
                                  >
                                    <option value="defer_to_period_end">{s.applyPeriodEnd}</option>
                                    <option value="none">{s.applyNow}</option>
                                  </select>
                                </label>
                                <button
                                  type="submit"
                                  className={cn(buttonVariants({ size: "sm" }), "w-fit")}
                                >
                                  {s.confirmChange}
                                </button>
                              </form>
                            </details>
                          ) : null}

                          {sub.cancel_at_period_end ? (
                            <span
                              className={cn(
                                buttonVariants({ variant: "ghost", size: "sm" }),
                                "pointer-events-none w-fit text-muted-foreground",
                              )}
                            >
                              {s.cancellationScheduled}
                            </span>
                          ) : (
                            <details className="group">
                              <summary
                                className={cn(
                                  buttonVariants({ variant: "ghost", size: "sm" }),
                                  summaryButton,
                                  "w-fit text-destructive",
                                )}
                              >
                                {s.cancelSub}
                              </summary>
                              <div className="mt-3 flex max-w-sm flex-col gap-3 rounded-lg border border-border p-3">
                                <p className="text-sm text-muted-foreground">{s.cancelHint}</p>
                                <form
                                  method="post"
                                  action={`/portal/${encodeURIComponent(session_token)}/subscriptions/${encodeURIComponent(sub.id)}/cancel`}
                                >
                                  <button
                                    type="submit"
                                    className={cn(buttonVariants({ variant: "destructive", size: "sm" }))}
                                  >
                                    {s.cancelConfirm}
                                  </button>
                                </form>
                              </div>
                            </details>
                          )}
                        </div>
                      ) : null}
                    </div>
                  );
                })
              )}
            </section>

            {/* ============ Payment method ============ */}
            <section className="flex flex-col gap-3 border-t border-border pt-10">
              <Eyebrow>{s.paymentMethod}</Eyebrow>
              {paymentMethods.length === 0 ? (
                <p className="text-sm text-muted-foreground">{s.noPaymentMethods}</p>
              ) : (
                <div className="flex flex-col gap-2">
                  {paymentMethods.map((pm) => {
                    const exp =
                      pm.exp_month && pm.exp_year
                        ? `${String(pm.exp_month).padStart(2, "0")}/${String(pm.exp_year).slice(-2)}`
                        : null;
                    return (
                      <div
                        key={pm.id}
                        className="flex items-center gap-3 rounded-lg border border-border px-3 py-3"
                      >
                        <CardBrandMark brand={pm.brand ?? pm.provider_id} />
                        <div className="min-w-0">
                          <p className="flex flex-wrap items-center gap-2 text-sm font-medium">
                            <span>
                              {pm.brand ? titleCase(pm.brand) : titleCase(pm.provider_id)}
                              {pm.last4 ? (
                                <span className="ml-1.5 font-mono tabular-nums text-muted-foreground">
                                  •••• {pm.last4}
                                </span>
                              ) : null}
                            </span>
                            {pm.is_default ? (
                              <StatusPill label={s.defaultBadge} tone="muted" />
                            ) : null}
                          </p>
                          {exp ? (
                            <p className="mt-0.5 text-xs text-muted-foreground">
                              {s.expires} {exp}
                            </p>
                          ) : null}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
              {primarySubId ? (
                <form
                  method="post"
                  action={`/portal/${encodeURIComponent(session_token)}/payment-methods/atmos/update`}
                  className="pt-1"
                >
                  <input type="hidden" name="subscriptionId" value={primarySubId} />
                  <button
                    type="submit"
                    className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "-ml-2.5")}
                  >
                    <Plus className="size-4" />
                    {paymentMethods.length ? s.updateCard : s.addCard}
                  </button>
                </form>
              ) : null}
            </section>

            {/* ============ Billing information ============ */}
            {contactLine ? (
              <section className="flex flex-col gap-3 border-t border-border pt-10">
                <Eyebrow>{s.billingInfo}</Eyebrow>
                <dl className="divide-y divide-border">
                  {customer?.email ? (
                    <div className="flex flex-col gap-0.5 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
                      <dt className="text-sm text-muted-foreground">{s.email}</dt>
                      <dd className="font-mono text-sm">{customer.email}</dd>
                    </div>
                  ) : null}
                  {customer?.phone ? (
                    <div className="flex flex-col gap-0.5 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
                      <dt className="text-sm text-muted-foreground">{s.phone}</dt>
                      <dd className="font-mono text-sm tabular-nums">{customer.phone}</dd>
                    </div>
                  ) : null}
                </dl>
              </section>
            ) : null}

            {/* ============ Invoice history ============ */}
            <section className="flex flex-col gap-3 border-t border-border pt-10">
              <Eyebrow>{s.invoiceHistory}</Eyebrow>
              {invoices.length === 0 ? (
                <p className="text-sm text-muted-foreground">{s.noInvoices}</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[440px] text-left text-sm">
                    <thead>
                      <tr className="border-b border-border text-xs tracking-wide text-muted-foreground uppercase">
                        <th className="py-2 pr-3 font-medium">{s.colDate}</th>
                        <th className="py-2 pr-3 font-medium">{s.colPlan}</th>
                        <th className="py-2 pr-3 text-right font-medium">{s.colAmount}</th>
                        <th className="py-2 font-medium">{s.colStatus}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {invoices.map((inv) => {
                        const meta = invoiceStatusMeta(inv.status, locale);
                        return (
                          <tr key={inv.id} className="border-b border-border last:border-0">
                            <td className="py-3 pr-3 font-mono whitespace-nowrap tabular-nums text-muted-foreground">
                              {fmtShortDate(inv.created_at, locale)}
                            </td>
                            <td className="py-3 pr-3">{subPlanName.get(inv.subscription_id) ?? "—"}</td>
                            <td className="py-3 pr-3 text-right font-mono tabular-nums">
                              {money(inv.amount_due_minor, inv.currency)}
                            </td>
                            <td className="py-3">
                              <StatusPill label={meta.label} tone={meta.tone} />
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </div>
        </main>
      </div>
    </div>
  );
}
