import { CircleCheck, CircleDashed, TriangleAlert } from "lucide-react"

import { ButtonLink } from "@/components/console/button-link"
import { Badge } from "@/components/ui/badge"
import {
  Card,
  CardAction,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import { fill, type Dict, type Locale } from "@/lib/i18n"
import type { ConsoleAgent as Agent } from "@/lib/agents"

export function AgentDetailVerification({
  agent,
  locale,
  dict,
}: {
  agent: Agent
  locale: Locale
  dict: Dict
}) {
  const { verificationPassed: passed, verificationTotal: total } = agent
  const percent = total > 0 ? Math.round((passed / total) * 100) : 0

  // Publishing is only unblocked by a run that actually happened and cleared
  // every case. "11 of 12" and "never run" are both blocked — an owner should
  // never read a green card and then find the agent cannot go live.
  const blocked = !(total > 0 && passed === total && agent.lastVerifiedAt)
  const summary = fill(dict.verification.passed, { passed, total })

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">{dict.verification.title}</CardTitle>
        <CardAction>
          <ButtonLink
            variant={blocked ? "outline" : "ghost"}
            size="sm"
            href={`/${locale}/agents/${agent.id}/verification`}
          >
            {blocked ? dict.verification.fixThis : dict.common.open}
          </ButtonLink>
        </CardAction>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <div className="flex items-baseline justify-between gap-4">
          <span className="font-mono text-sm tabular-nums">{summary}</span>
          <span className="font-mono text-xs tabular-nums text-muted-foreground">
            {percent}%
          </span>
        </div>

        <Progress value={percent} aria-label={summary} />

        <div className="flex flex-wrap items-center gap-2">
          {blocked ? (
            <Badge variant="destructive" className="gap-1">
              <TriangleAlert />
              {dict.verification.blocked}
            </Badge>
          ) : (
            <Badge variant="outline" className="gap-1 font-normal">
              <CircleCheck />
              {dict.verification.ready}
            </Badge>
          )}
          {agent.lastVerifiedAt ? null : (
            <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
              <CircleDashed className="size-3.5" />
              {dict.agents.neverVerified}
            </span>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
