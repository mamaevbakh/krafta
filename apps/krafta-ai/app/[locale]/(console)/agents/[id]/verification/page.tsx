import { notFound } from "next/navigation"

import { ButtonLink } from "@/components/console/button-link"
import { PageBody, PageHeader } from "@/components/console/page-header"
import { VerificationReport } from "@/components/console/verification-report"
import { latestRun } from "@/lib/verification/read"
import { getAgent } from "@/lib/agents"
import { getSelectedOrg } from "@/lib/orgs"
import { getDict, type Locale } from "@/lib/i18n"

/**
 * Onboarding ends here, not on a "saved" screen. The promise the product makes
 * is that an agent is proven before a customer ever talks to it, so this page
 * is the proof — and a failed check leaves as a named task, never as a generic
 * error the merchant has no way to act on.
 */
export default async function VerificationPage({
  params,
}: {
  params: Promise<{ locale: Locale; id: string }>
}) {
  const { locale, id } = await params
  const dict = getDict(locale)

  const org = await getSelectedOrg()
  const agent = org ? await getAgent(org.id, id) : null
  if (!agent) notFound()

  const run = org ? await latestRun(org.id, agent.id) : null
  // Mapped into the shape the report already renders. An agent that has never
  // been verified yields an empty list, which the report shows as an
  // invitation rather than as failed checks it was never put through.
  const cases = (run?.results ?? []).map((r) => ({
    id: r.id,
    prompt: r.prompt,
    lang: r.lang ?? "uz",
    asserts: r.assertion,
    severity: r.severity,
    passed: r.passed,
    remediation: r.remediation ?? undefined,
  }))

  return (
    <>
      <PageHeader
        title={dict.verification.title}
        subtitle={agent.name}
        actions={
          <ButtonLink
            variant="outline"
            size="sm"
            href={`/${locale}/agents/${agent.id}/preview`}
          >
            {dict.agents.preview}
          </ButtonLink>
        }
      />
      <PageBody>
        <VerificationReport
          locale={locale}
          dict={dict}
          agentId={agent.id}
          cases={cases}
          lastVerifiedAt={agent.lastVerifiedAt}
        />
      </PageBody>
    </>
  )
}
