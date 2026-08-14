import { Badge } from "@/components/ui/badge"
import {
  Card,
  CardAction,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import { templateBySlug } from "@/lib/mock/data"
import type { ConsoleAgent as Agent } from "@/lib/agents"
import { LOCALE_LABELS, isLocale, type Dict, type Locale } from "@/lib/i18n"

function Row({ term, children }: { term: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-6 py-2.5">
      <dt className="shrink-0 text-sm text-muted-foreground">{term}</dt>
      <dd className="min-w-0 text-right text-sm">{children}</dd>
    </div>
  )
}

export function AgentDetailConfig({
  agent,
  locale,
  dict,
}: {
  agent: Agent
  locale: Locale
  dict: Dict
}) {
  const template = templateBySlug(agent.templateSlug ?? "")
  const integrations = template?.requiredIntegrations ?? []

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">{dict.setup.title}</CardTitle>
        <CardAction>
          <div className="flex flex-wrap justify-end gap-1.5">
            {agent.languages.map((code) => (
              <Badge key={code} variant="secondary" className="font-normal">
                {isLocale(code) ? LOCALE_LABELS[code] : code.toUpperCase()}
              </Badge>
            ))}
          </div>
        </CardAction>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <dl className="-my-2.5 divide-y">
          <Row term={dict.agents.template}>
            {template?.name[locale] ?? agent.templateSlug}
          </Row>
          <Row term={dict.agents.channel}>
            <span className="capitalize">{agent.channel}</span>
          </Row>
          <Row term={dict.templates.required}>
            {integrations.length > 0 ? (
              <span className="inline-flex flex-wrap justify-end gap-1.5">
                {integrations.map((name) => (
                  <Badge key={name} variant="outline" className="font-normal">
                    {name}
                  </Badge>
                ))}
              </span>
            ) : (
              <span className="font-mono text-muted-foreground">—</span>
            )}
          </Row>
        </dl>

        <Separator />

        {/*
          The owner's own brief, shown verbatim in the language they wrote it
          in — a translated paraphrase would misrepresent what the agent says.
        */}
        <p className="border-l pl-3 text-sm leading-relaxed text-muted-foreground">
          {agent.persona || (template?.blurb[locale] ?? agent.templateSlug)}
        </p>
      </CardContent>
    </Card>
  )
}
