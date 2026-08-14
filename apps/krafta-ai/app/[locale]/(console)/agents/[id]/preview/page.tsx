import { notFound } from "next/navigation"

import { ButtonLink } from "@/components/console/button-link"
import { PageBody, PageHeader } from "@/components/console/page-header"
import { PreviewChat } from "@/components/console/preview-chat"
import { getAgent } from "@/lib/agents"
import { getSelectedOrg } from "@/lib/orgs"
import { getUsageSummary } from "@/lib/usage"
import { getDict, type Locale } from "@/lib/i18n"

export default async function AgentPreviewPage({
  params,
}: {
  params: Promise<{ locale: Locale; id: string }>
}) {
  const { locale, id } = await params
  const org = await getSelectedOrg()
  // Two narrowings rather than one so `org` is non-null below. A merchant with
  // no business and an id that does not exist get the same 404 either way —
  // distinguishing them would confirm which agent ids are real.
  if (!org) notFound()

  const agent = await getAgent(org.id, id)
  if (!agent) notFound()

  const dict = getDict(locale)

  // Asked here rather than left to the runtime, which can only answer a
  // refusal with a bare 401 that the browser cannot tell apart from a lost
  // session. Deliberately NOT agent.quota_check: that consumes a rate-limit
  // slot, and rendering a page must not spend part of the merchant's
  // allowance.
  const usage = await getUsageSummary(org.id)

  return (
    <>
      <PageHeader
        title={agent.name}
        subtitle={dict.preview.subtitle}
        actions={
          /* A plain way back is ghost across the console (see the setup
             screen) — outline here made it read as the screen's action. */
          <ButtonLink
            variant="ghost"
            size="sm"
            href={`/${locale}/agents/${agent.id}`}
          >
            {dict.common.back}
          </ButtonLink>
        }
      />
      <PageBody>
        <PreviewChat
          agentId={agent.id}
          dict={dict}
          agentName={agent.name}
          languages={agent.languages}
          blockedReason={usage.blocked?.reason ?? null}
        />
      </PageBody>
    </>
  )
}
