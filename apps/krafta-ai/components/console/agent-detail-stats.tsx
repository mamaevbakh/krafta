import { CalendarCheck, MessagesSquare, Radio, UserRoundCheck } from "lucide-react"

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import type { ConsoleAgent as Agent } from "@/lib/agents"
import type { Dict, Locale } from "@/lib/i18n"

/**
 * `uz-UZ` is asked for first even though some ICU builds have no data for it —
 * Intl silently falls back to the closest available locale, which is fine. The
 * try/catch is for the other failure: a build with a trimmed ICU can throw on
 * an unknown tag, and a merchant should get a slightly foreign-looking date
 * rather than a crashed page.
 */
const DATE_TAG: Record<Locale, string> = {
  uz: "uz-UZ",
  ru: "ru-RU",
  en: "en-GB",
}

/**
 * Timestamps carry +05:00 and are pinned back to Tashkent on render. Without
 * the pin, a server in UTC would tell a Tashkent owner the check ran at 09:20
 * when they watched it run at 14:20.
 */
function formatVerifiedAt(
  iso: string,
  locale: Locale
): { day: string; time: string } | null {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return null

  function build(tag: string) {
    return {
      day: new Intl.DateTimeFormat(tag, {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        timeZone: "Asia/Tashkent",
      }).format(date),
      time: new Intl.DateTimeFormat(tag, {
        hour: "2-digit",
        minute: "2-digit",
        hourCycle: "h23",
        timeZone: "Asia/Tashkent",
      }).format(date),
    }
  }

  try {
    return build(DATE_TAG[locale])
  } catch {
    return build("en-GB")
  }
}

function Stat({
  icon: Icon,
  label,
  value,
  caption,
}: {
  icon: React.ComponentType<{ className?: string }>
  label: string
  value: React.ReactNode
  caption?: React.ReactNode
}) {
  // Same composition as the overview's stat tiles — header carries the label,
  // content carries the number — so the two screens read as one system. Only
  // the density differs: four of these sit under a title bar, and a date at
  // the overview's type scale does not survive a 375px phone.
  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle className="flex items-center gap-1.5 text-xs font-normal text-muted-foreground">
          <Icon className="size-3.5 shrink-0" />
          <span className="truncate">{label}</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-1">
        <div className="text-lg leading-tight">{value}</div>
        <div className="min-h-4 text-xs text-muted-foreground">{caption}</div>
      </CardContent>
    </Card>
  )
}

export function AgentDetailStats({
  agent,
  locale,
  dict,
}: {
  agent: Agent
  locale: Locale
  dict: Dict
}) {
  const verified = agent.lastVerifiedAt
    ? formatVerifiedAt(agent.lastVerifiedAt, locale)
    : null

  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <Stat
        icon={MessagesSquare}
        label={dict.overview.conversations}
        value={
          <span className="font-mono tabular-nums">
            {agent.conversations7d.toLocaleString("ru-RU")}
          </span>
        }
        caption={dict.overview.thisWeek}
      />
      <Stat
        icon={UserRoundCheck}
        label={dict.overview.resolved}
        value={
          <span className="font-mono tabular-nums">
            {Math.round(agent.resolvedRate * 100)}%
          </span>
        }
        caption={dict.overview.thisWeek}
      />
      <Stat
        icon={CalendarCheck}
        label={dict.agents.lastVerified}
        value={
          verified ? (
            <span className="font-mono tabular-nums">{verified.day}</span>
          ) : (
            <span className="text-muted-foreground">
              {dict.agents.neverVerified}
            </span>
          )
        }
        caption={
          verified ? (
            <span className="font-mono tabular-nums">{verified.time}</span>
          ) : null
        }
      />
      <Stat
        icon={Radio}
        label={dict.agents.channel}
        value={<span className="capitalize">{agent.channel}</span>}
        caption={
          <span className="font-mono tabular-nums uppercase">
            {agent.languages.join(" · ")}
          </span>
        }
      />
    </div>
  )
}
