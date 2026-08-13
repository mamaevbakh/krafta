import { ArrowUpRight, MessagesSquare, TimerReset, UserRoundCheck } from "lucide-react"

import { PageBody, PageHeader } from "@/components/console/page-header"
import { AgentRow } from "@/components/console/agent-row"
import { ButtonLink } from "@/components/console/button-link"
import { Badge } from "@/components/ui/badge"
import {
  Card,
  CardAction,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { ItemGroup } from "@/components/ui/item"
import { APPROVALS } from "@/lib/mock/data"
import { listAgents } from "@/lib/agents"
import { getSelectedOrg } from "@/lib/orgs"
import { getDict, type Locale } from "@/lib/i18n"

export default async function OverviewPage({
  params,
}: {
  params: Promise<{ locale: Locale }>
}) {
  const { locale } = await params
  const dict = getDict(locale)

  const org = await getSelectedOrg()
  const AGENTS = org ? await listAgents(org.id) : []

  const conversations = AGENTS.reduce((sum, a) => sum + a.conversations7d, 0)
  const live = AGENTS.filter((a) => a.status === "live")
  const resolvedRate = live.length
    ? live.reduce((sum, a) => sum + a.resolvedRate, 0) / live.length
    : 0
  const escalated = Math.round(conversations * (1 - resolvedRate))
  // The number that wins an "industry and entrepreneurship" pitch: a resolved
  // conversation is roughly four minutes a human did not spend.
  const hoursSaved = Math.round((conversations * resolvedRate * 4) / 60)

  const stats = [
    {
      label: dict.overview.conversations,
      value: conversations.toLocaleString("ru-RU"),
      icon: MessagesSquare,
    },
    {
      label: dict.overview.resolved,
      value: `${Math.round(resolvedRate * 100)}%`,
      icon: UserRoundCheck,
    },
    {
      label: dict.overview.escalated,
      value: escalated.toLocaleString("ru-RU"),
      icon: ArrowUpRight,
    },
    {
      label: dict.overview.savedHours,
      value: `${hoursSaved}`,
      icon: TimerReset,
    },
  ]

  return (
    <>
      <PageHeader
        title={dict.overview.title}
        subtitle={dict.overview.subtitle}
        actions={
          <ButtonLink size="sm" href={`/${locale}/templates`}>
            {dict.agents.create}
          </ButtonLink>
        }
      />
      <PageBody>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {stats.map((stat) => (
            <Card key={stat.label}>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-xs font-normal text-muted-foreground">
                  <stat.icon className="size-3.5" />
                  {stat.label}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="font-mono text-2xl tabular-nums">
                  {stat.value}
                </div>
                <div className="text-xs text-muted-foreground">
                  {dict.overview.thisWeek}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {APPROVALS.length > 0 ? (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-sm">
                {dict.approvals.title}
                <Badge variant="secondary" className="font-mono tabular-nums">
                  {APPROVALS.length}
                </Badge>
              </CardTitle>
              <CardAction>
                <ButtonLink
                  variant="ghost"
                  size="sm"
                  href={`/${locale}/approvals`}
                >
                  {dict.common.open}
                </ButtonLink>
              </CardAction>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              {APPROVALS[0].summary[locale]}
            </CardContent>
          </Card>
        ) : null}

        <Card>
          <CardHeader>
            <CardTitle className="text-sm">{dict.agents.title}</CardTitle>
            <CardAction>
              <ButtonLink variant="ghost" size="sm" href={`/${locale}/agents`}>
                {dict.common.all}
              </ButtonLink>
            </CardAction>
          </CardHeader>
          <CardContent>
            <ItemGroup>
              {AGENTS.map((agent) => (
                <AgentRow
                  key={agent.id}
                  agent={agent}
                  locale={locale}
                  dict={dict}
                />
              ))}
            </ItemGroup>
          </CardContent>
        </Card>
      </PageBody>
    </>
  )
}
