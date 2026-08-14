import { notFound } from "next/navigation"
import { Clock } from "lucide-react"

import { ButtonLink } from "@/components/console/button-link"
import { PageBody, PageHeader } from "@/components/console/page-header"
import { SetupWizard } from "@/components/console/setup-wizard"
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { templateBySlug } from "@/lib/mock/data"
import { getDict, type Locale } from "@/lib/i18n"

export default async function TemplateSetupPage({
  params,
}: {
  params: Promise<{ locale: Locale; slug: string }>
}) {
  const { locale, slug } = await params
  const template = templateBySlug(slug)
  if (!template) notFound()

  const dict = getDict(locale)

  return (
    <>
      <PageHeader
        title={dict.setup.title}
        subtitle={template.name[locale]}
        actions={
          <ButtonLink variant="ghost" size="sm" href={`/${locale}/templates`}>
            {dict.common.back}
          </ButtonLink>
        }
      />
      <PageBody>
        {/*
          Setup is a single column on purpose: one question at a time, nothing
          in the periphery competing with it. The column caps out well before
          the sidebar's width so the questions stay readable on a laptop and
          the whole thing still fits a phone.
        */}
        <div className="mx-auto w-full max-w-2xl">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">{template.name[locale]}</CardTitle>
              <CardAction>
                <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Clock className="size-3.5 shrink-0" />
                  <span>
                    {dict.templates.setupTime}{" "}
                    <span className="font-mono text-foreground tabular-nums">
                      {template.setupMinutes}
                    </span>{" "}
                    {dict.templates.minutes}
                  </span>
                </span>
              </CardAction>
              <CardDescription className="text-pretty">
                {template.blurb[locale]}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <SetupWizard locale={locale} template={template} />
            </CardContent>
          </Card>
        </div>
      </PageBody>
    </>
  )
}
