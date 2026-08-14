import { AlertTriangle, Gauge, MessagesSquare, Wallet } from "lucide-react"

import { PageBody, PageHeader } from "@/components/console/page-header"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"
import { Progress, ProgressLabel } from "@/components/ui/progress"
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { getSelectedOrg } from "@/lib/orgs"
import { formatUsd, getUsageSummary } from "@/lib/usage"
import { getDict, type Locale } from "@/lib/i18n"

const COUNT = new Intl.NumberFormat("ru-RU")

/** Digits only, pinned to Tashkent — the same reasoning as the audit log. */
const DAY = new Intl.DateTimeFormat("ru-RU", {
  timeZone: "Asia/Tashkent",
  day: "2-digit",
  month: "2-digit",
})

export default async function UsagePage({
  params,
}: {
  params: Promise<{ locale: Locale }>
}) {
  const { locale } = await params
  const dict = getDict(locale)

  const org = await getSelectedOrg()
  if (!org) {
    return (
      <>
        <PageHeader title={dict.usage.title} subtitle={dict.usage.subtitle} />
        <PageBody>
          <Empty>
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <Gauge />
              </EmptyMedia>
              <EmptyTitle>{dict.usage.noUsageYet}</EmptyTitle>
            </EmptyHeader>
          </Empty>
        </PageBody>
      </>
    )
  }

  const usage = await getUsageSummary(org.id)
  const { limits } = usage

  // The bar is only honest when there is something to be a fraction of.
  const monthlyCap = limits.monthlyCostCapMicros
  const monthPct =
    monthlyCap && monthlyCap > 0
      ? Math.min(100, Math.round((usage.month.costMicros / monthlyCap) * 100))
      : null

  return (
    <>
      <PageHeader title={dict.usage.title} subtitle={dict.usage.subtitle} />
      <PageBody>
        {/*
          The blocked state comes first and is loud, because it is the one
          thing on this page that means a customer somewhere is being ignored
          right now. Everything below is accounting.
        */}
        {usage.blocked ? (
          <Alert variant="destructive">
            <AlertTriangle />
            <AlertTitle>{dict.budget.blockedTitle}</AlertTitle>
            <AlertDescription>
              {dict.budget[usage.blocked.reason]}
            </AlertDescription>
          </Alert>
        ) : usage.alerts.length > 0 ? (
          <Alert>
            <AlertTriangle />
            <AlertTitle>{dict.budget.warningTitle}</AlertTitle>
            <AlertDescription>
              {dict.budget.warningBody
                .replace("{used}", formatUsd(usage.alerts[0].costMicros))
                .replace("{cap}", formatUsd(usage.alerts[0].capMicros))}
            </AlertDescription>
          </Alert>
        ) : null}

        <div className="grid gap-3 lg:grid-cols-3">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-xs font-normal text-muted-foreground">
                <Wallet className="size-3.5" />
                {dict.usage.thisMonth}
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-1 flex-col justify-between gap-4">
              <div className="flex items-baseline gap-1.5">
                <span className="font-mono text-3xl tabular-nums">
                  {formatUsd(usage.month.costMicros)}
                </span>
              </div>
              {monthlyCap ? (
                <Progress value={usage.month.costMicros} max={monthlyCap} className="gap-2">
                  <ProgressLabel className="text-xs font-normal text-muted-foreground">
                    {dict.usage.monthlyLimit}
                  </ProgressLabel>
                  <span className="ml-auto font-mono text-xs tabular-nums text-muted-foreground">
                    {monthPct}% {formatUsd(monthlyCap)}
                  </span>
                </Progress>
              ) : (
                <p className="font-mono text-xs text-muted-foreground">
                  {limits.unlimited ? dict.usage.unlimited : dict.usage.noLimit}
                </p>
              )}
            </CardContent>
          </Card>

          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-xs font-normal text-muted-foreground">
                <MessagesSquare className="size-3.5" />
                {dict.usage.today}
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <div className="flex items-baseline gap-3">
                <span className="font-mono text-3xl tabular-nums">
                  {COUNT.format(usage.today.turns)}
                </span>
                <span className="text-sm text-muted-foreground">
                  {dict.usage.turns}
                </span>
              </div>

              {limits.dailyTurnCap ? (
                <Progress
                  value={usage.today.turns}
                  max={limits.dailyTurnCap}
                  className="gap-2"
                >
                  <ProgressLabel className="text-xs font-normal text-muted-foreground">
                    {dict.usage.dailyLimit}
                  </ProgressLabel>
                  <span className="ml-auto font-mono text-xs tabular-nums text-muted-foreground">
                    {COUNT.format(usage.today.turns)} /{" "}
                    {COUNT.format(limits.dailyTurnCap)}
                  </span>
                </Progress>
              ) : (
                <p className="font-mono text-xs text-muted-foreground">
                  {limits.unlimited ? dict.usage.unlimited : dict.usage.noLimit}
                </p>
              )}

              <div className="flex items-center justify-between border-t pt-3">
                <span className="text-sm text-muted-foreground">
                  {dict.usage.resetsAt}
                </span>
                <span className="font-mono text-sm tabular-nums">
                  {formatUsd(usage.today.costMicros)}
                </span>
              </div>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm">{dict.usage.byDay}</CardTitle>
          </CardHeader>
          <CardContent>
            {usage.days.length === 0 ? (
              <Empty>
                <EmptyHeader>
                  <EmptyMedia variant="icon">
                    <Gauge />
                  </EmptyMedia>
                  <EmptyTitle>{dict.usage.noUsageYet}</EmptyTitle>
                </EmptyHeader>
              </Empty>
            ) : (
              <div className="w-full overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-xs text-muted-foreground">
                        {dict.usage.day}
                      </TableHead>
                      <TableHead className="text-right text-xs text-muted-foreground">
                        {dict.usage.turns}
                      </TableHead>
                      <TableHead className="text-right text-xs text-muted-foreground">
                        {dict.usage.cost}
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {/* Newest first: the day a merchant cares about is today. */}
                    {[...usage.days].reverse().map((d) => (
                      <TableRow key={d.day}>
                        <TableCell className="font-mono tabular-nums">
                          {DAY.format(new Date(`${d.day}T12:00:00Z`))}
                        </TableCell>
                        <TableCell className="text-right font-mono tabular-nums">
                          {COUNT.format(d.turns)}
                        </TableCell>
                        <TableCell className="text-right font-mono tabular-nums text-muted-foreground">
                          {formatUsd(d.costMicros)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                  <TableFooter>
                    <TableRow>
                      <TableCell>{dict.usage.thisMonth}</TableCell>
                      <TableCell className="text-right font-mono tabular-nums">
                        {COUNT.format(usage.month.turns)}
                      </TableCell>
                      <TableCell className="text-right font-mono tabular-nums">
                        {formatUsd(usage.month.costMicros)}
                      </TableCell>
                    </TableRow>
                  </TableFooter>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </PageBody>
    </>
  )
}
