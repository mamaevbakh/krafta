import { PageBody, PageHeader } from "@/components/console/page-header"
import { TemplateCard } from "@/components/console/template-card"
import { TemplateDescribe } from "@/components/console/template-describe"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { TEMPLATES } from "@/lib/mock/data"
import { getDict, type Locale } from "@/lib/i18n"

/**
 * Three templates that show the range of the catalogue — answering customers,
 * taking an order, running a daily report — one per capability the owner might
 * be shopping for. Their own blurbs become the example prompts, so the chips
 * are already in the visitor's language.
 */
const EXAMPLE_SLUGS = ["venue-support", "order-desk", "reporting"]

export default async function TemplatesPage({
  params,
}: {
  params: Promise<{ locale: Locale }>
}) {
  const { locale } = await params
  const dict = getDict(locale)

  const examples = TEMPLATES.filter((t) => EXAMPLE_SLUGS.includes(t.slug)).map(
    (t) => ({
      slug: t.slug,
      label: t.name[locale],
      prompt: t.blurb[locale],
    })
  )

  return (
    <>
      <PageHeader
        title={dict.templates.title}
        subtitle={dict.templates.subtitle}
      />
      <PageBody>
        <TemplateDescribe dict={dict} locale={locale} examples={examples} />

        <Separator />

        <section className="flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-medium">{dict.nav.templates}</h2>
            <Badge variant="secondary" className="font-mono tabular-nums">
              {TEMPLATES.length}
            </Badge>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {TEMPLATES.map((template) => (
              <TemplateCard
                key={template.slug}
                template={template}
                locale={locale}
                dict={dict}
              />
            ))}
          </div>
        </section>
      </PageBody>
    </>
  )
}
