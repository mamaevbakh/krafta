import Link from "next/link"
import { CircleCheck, CircleDashed, TriangleAlert } from "lucide-react"

import { ButtonLink } from "@/components/console/button-link"
import { Badge } from "@/components/ui/badge"
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemMedia,
  ItemTitle,
} from "@/components/ui/item"
import { StatusDot } from "@/components/console/status-dot"
import { templateBySlug } from "@/lib/mock/data"
import type { ConsoleAgent as Agent } from "@/lib/agents"
import { fill, type Dict, type Locale } from "@/lib/i18n"

export function AgentRow({
  agent,
  locale,
  dict,
}: {
  agent: Agent
  locale: Locale
  dict: Dict
}) {
  const template = templateBySlug(agent.templateSlug ?? "")
  const gatesClear =
    agent.verificationTotal > 0 &&
    agent.verificationPassed === agent.verificationTotal

  const VerifyIcon = agent.lastVerifiedAt
    ? gatesClear
      ? CircleCheck
      : TriangleAlert
    : CircleDashed

  return (
    <Item variant="outline" className="rounded-lg">
      <ItemMedia variant="icon">
        <StatusDot status={agent.status} />
      </ItemMedia>
      <ItemContent>
        <ItemTitle className="flex items-center gap-2">
          <Link href={`/${locale}/agents/${agent.id}`} className="hover:underline">
            {agent.name}
          </Link>
          <Badge variant="outline" className="font-normal">
            {agent.status === "live"
              ? dict.common.live
              : agent.status === "draft"
                ? dict.common.draft
                : dict.common.paused}
          </Badge>
        </ItemTitle>
        <ItemDescription className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <span>{template?.name[locale] ?? agent.templateSlug}</span>
          <span className="inline-flex items-center gap-1">
            <VerifyIcon className="size-3.5" />
            <span className="font-mono tabular-nums">
              {agent.lastVerifiedAt
                ? fill(dict.verification.passed, {
                    passed: agent.verificationPassed,
                    total: agent.verificationTotal,
                  })
                : dict.agents.neverVerified}
            </span>
          </span>
          <span className="uppercase">{agent.languages.join(" · ")}</span>
        </ItemDescription>
      </ItemContent>
      <ItemActions>
        <ButtonLink
          variant="ghost"
          size="sm"
          href={`/${locale}/agents/${agent.id}/preview`}
        >
          {dict.agents.preview}
        </ButtonLink>
      </ItemActions>
    </Item>
  )
}
