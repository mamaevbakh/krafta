import { Sparkles } from "lucide-react"

import { AgentRow } from "@/components/console/agent-row"
import {
  AgentsStatusFilter,
  type AgentFilterOption,
  type AgentStatusFilter,
} from "@/components/console/agents-status-filter"
import { ButtonLink } from "@/components/console/button-link"
import { PageBody, PageHeader } from "@/components/console/page-header"
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"
import { ItemGroup } from "@/components/ui/item"
import { listAgents } from "@/lib/agents"
import { getSelectedOrg } from "@/lib/orgs"
import { getDict, type Locale } from "@/lib/i18n"

/** `?status=` is user input, so it is narrowed rather than trusted. */
function parseFilter(raw: string | string[] | undefined): AgentStatusFilter {
  const first = Array.isArray(raw) ? raw[0] : raw
  return first === "live" || first === "draft" || first === "paused"
    ? first
    : "all"
}

export default async function AgentsPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: Locale }>
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
  const { locale } = await params
  const { status } = await searchParams
  const dict = getDict(locale)

  const org = await getSelectedOrg()
  const AGENTS = org ? await listAgents(org.id) : []

  const active = parseFilter(status)
  const visible =
    active === "all" ? AGENTS : AGENTS.filter((a) => a.status === active)

  const options: AgentFilterOption[] = [
    { value: "all", label: dict.common.all, count: AGENTS.length },
    {
      value: "live",
      label: dict.common.live,
      count: AGENTS.filter((a) => a.status === "live").length,
    },
    {
      value: "draft",
      label: dict.common.draft,
      count: AGENTS.filter((a) => a.status === "draft").length,
    },
    {
      value: "paused",
      label: dict.common.paused,
      count: AGENTS.filter((a) => a.status === "paused").length,
    },
  ]

  return (
    <>
      <PageHeader
        title={dict.agents.title}
        subtitle={dict.agents.subtitle}
        actions={
          <ButtonLink size="sm" href={`/${locale}/templates`}>
            {dict.agents.create}
          </ButtonLink>
        }
      />
      <PageBody>
        <AgentsStatusFilter value={active} options={options}>
          {visible.length > 0 ? (
            <ItemGroup>
              {visible.map((agent) => (
                <AgentRow
                  key={agent.id}
                  agent={agent}
                  locale={locale}
                  dict={dict}
                />
              ))}
            </ItemGroup>
          ) : (
            <Empty className="border">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <Sparkles />
                </EmptyMedia>
                <EmptyTitle>{dict.overview.noAgents}</EmptyTitle>
                <EmptyDescription>
                  {dict.overview.noAgentsHint}
                </EmptyDescription>
              </EmptyHeader>
              <EmptyContent>
                <ButtonLink size="sm" href={`/${locale}/templates`}>
                  {dict.agents.create}
                </ButtonLink>
              </EmptyContent>
            </Empty>
          )}
        </AgentsStatusFilter>
      </PageBody>
    </>
  )
}
