import Link from "next/link"
import { BookOpen, Clock, Plug, UserRound, Wrench } from "lucide-react"

import { ButtonLink } from "@/components/console/button-link"
import { Badge } from "@/components/ui/badge"
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import type { CapabilityFamily, Template } from "@/lib/mock/data"
import type { Dict, Locale } from "@/lib/i18n"

/**
 * The family is a system tag, not prose — same class of thing as the tool
 * names in the audit log, so it stays in its raw form and leans on an icon to
 * carry the meaning rather than pretending to be translated copy.
 */
const FAMILY_ICON: Record<
  CapabilityFamily,
  React.ComponentType<{ className?: string }>
> = {
  knowledge: BookOpen,
  systems: Plug,
  personal: UserRound,
  builder: Wrench,
}

export function TemplateCard({
  template,
  locale,
  dict,
}: {
  template: Template
  locale: Locale
  dict: Dict
}) {
  const FamilyIcon = FAMILY_ICON[template.family]
  const setupHref = `/${locale}/templates/${template.slug}/setup`

  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle>
          <Link href={setupHref} className="hover:underline">
            {template.name[locale]}
          </Link>
        </CardTitle>
        <CardAction>
          <Badge variant="secondary" className="font-normal">
            {template.category[locale]}
          </Badge>
        </CardAction>
        <CardDescription className="text-pretty">
          {template.blurb[locale]}
        </CardDescription>
      </CardHeader>

      <CardContent className="flex flex-1 flex-col gap-3">
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <FamilyIcon className="size-3.5" />
          <span className="font-mono">{template.family}</span>
        </div>

        <div className="flex flex-col gap-1.5">
          <div className="text-xs text-muted-foreground">
            {dict.templates.required}
          </div>
          {template.requiredIntegrations.length > 0 ? (
            <div className="flex flex-wrap gap-1">
              {template.requiredIntegrations.map((integration) => (
                <Badge
                  key={integration}
                  variant="outline"
                  className="font-normal"
                >
                  {integration}
                </Badge>
              ))}
            </div>
          ) : (
            // Nothing to connect — an em dash says that in every language,
            // and keeps the cards on one baseline across the row.
            <div className="font-mono text-xs text-muted-foreground">—</div>
          )}
        </div>
      </CardContent>

      <CardFooter className="gap-2">
        <span className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
          <Clock className="size-3.5 shrink-0" />
          <span className="truncate">
            {dict.templates.setupTime}{" "}
            <span className="font-mono text-foreground tabular-nums">
              {template.setupMinutes}
            </span>{" "}
            {dict.templates.minutes}
          </span>
        </span>
        <ButtonLink size="sm" href={setupHref} className="ml-auto">
          {dict.templates.useTemplate}
        </ButtonLink>
      </CardFooter>
    </Card>
  )
}
