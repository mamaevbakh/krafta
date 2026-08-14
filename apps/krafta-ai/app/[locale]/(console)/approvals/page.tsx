import { PageBody, PageHeader } from "@/components/console/page-header"
import { ApprovalsList } from "@/components/console/approvals-list"
import { getDict, type Locale } from "@/lib/i18n"

export default async function ApprovalsPage({
  params,
}: {
  params: Promise<{ locale: Locale }>
}) {
  const { locale } = await params
  const dict = getDict(locale)

  return (
    <>
      <PageHeader
        title={dict.approvals.title}
        subtitle={dict.approvals.subtitle}
      />
      <PageBody>
        <ApprovalsList locale={locale} dict={dict} />
      </PageBody>
    </>
  )
}
