import { notFound } from "next/navigation"

import { AgentDetailConfig } from "@/components/console/agent-detail-config"
import { AgentDetailStats } from "@/components/console/agent-detail-stats"
import { AgentDetailVerification } from "@/components/console/agent-detail-verification"
import { ButtonLink } from "@/components/console/button-link"
import { PageBody, PageHeader } from "@/components/console/page-header"
import { StatusDot } from "@/components/console/status-dot"
import { Badge } from "@/components/ui/badge"
import { templateBySlug } from "@/lib/mock/data"
import { getAgent, type AgentStatus } from "@/lib/agents"
import { getSelectedOrg } from "@/lib/orgs"
import { getDict, type Dict, type Locale } from "@/lib/i18n"

function statusLabel(status: AgentStatus, dict: Dict): string {
  return status === "live"
    ? dict.common.live
    : status === "draft"
      ? dict.common.draft
      : dict.common.paused
}

export default async function AgentDetailPage({
  params,
}: {
  params: Promise<{ locale: Locale; id: string }>
}) {
  const { locale, id } = await params
  const dict = getDict(locale)

  // 404 rather than 403 for an agent that isn't this business's: a distinct
  // error would confirm the agent exists, which is an enumeration oracle over
  // the merchant list.
  const org = await getSelectedOrg()
  const agent = org ? await getAgent(org.id, id) : null
  if (!agent) notFound()

  const template = templateBySlug(agent.templateSlug ?? "")

  return (
    <>
      <PageHeader
        title={agent.name}
        subtitle={template?.name[locale] ?? agent.templateSlug ?? undefined}
        actions={
          <>
            {/*
              On a phone the agent's own name is what the owner needs to read,
              so the status collapses to its dot and gives the title back its
              width. `sr-only` rather than `hidden` — a screen reader still
              hears "Qoralama", it is only the sighted label that folds away.
            */}
            <Badge
              variant="outline"
              className="gap-1.5 px-1.5 font-normal sm:px-2"
            >
              <StatusDot status={agent.status} />
              <span className="sr-only sm:not-sr-only">
                {statusLabel(agent.status, dict)}
              </span>
            </Badge>
            <ButtonLink
              variant="outline"
              size="sm"
              href={`/${locale}/agents/${agent.id}/preview`}
            >
              {dict.agents.preview}
            </ButtonLink>
            {/*
              Below `sm` the title has to survive next to the actions, and the
              verification card in the body links to the same screen with a
              clearer label — so this one drops rather than squeezing the name.
            */}
            <ButtonLink
              size="sm"
              className="hidden sm:inline-flex"
              href={`/${locale}/agents/${agent.id}/verification`}
            >
              {dict.verification.title}
            </ButtonLink>
          </>
        }
      />
      <PageBody>
        <AgentDetailStats agent={agent} locale={locale} dict={dict} />

        <div className="grid gap-4 lg:grid-cols-5">
          <div className="lg:col-span-2">
            <AgentDetailVerification
              agent={agent}
              locale={locale}
              dict={dict}
            />
          </div>
          <div className="lg:col-span-3">
            <AgentDetailConfig agent={agent} locale={locale} dict={dict} />
          </div>
        </div>
      </PageBody>
    </>
  )
}
