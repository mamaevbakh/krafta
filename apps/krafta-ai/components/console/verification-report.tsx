"use client"

import * as React from "react"
import {
  CircleCheck,
  CircleDashed,
  CircleX,
  Clock,
  RefreshCw,
  Wrench,
} from "lucide-react"
import { toast } from "sonner"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardAction,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemFooter,
  ItemGroup,
  ItemMedia,
  ItemTitle,
} from "@/components/ui/item"
import { Progress } from "@/components/ui/progress"
import { Spinner } from "@/components/ui/spinner"
import { useRouter } from "next/navigation"

import { publishAgent } from "@/lib/actions/publish"
import { startVerificationRun } from "@/lib/actions/verification"
import { fill, type Dict, type Locale } from "@/lib/i18n"
import type { VerificationCase } from "@/lib/mock/data"
import { cn } from "@/lib/utils"

/**
 * The prompt is the literal question we put to the agent, so it is quoted
 * rather than paraphrased. The marks are typography, not copy — Uzbek and
 * Russian take guillemets, English takes curly doubles.
 */
const QUOTE_MARKS: Record<Locale, readonly [string, string]> = {
  uz: ["«", "»"],
  ru: ["«", "»"],
  en: ["“", "”"],
}

/**
 * Sliced out of the ISO stamp instead of run through Intl on purpose: this
 * component is server-rendered and then hydrated, and a timezone-aware format
 * would disagree between the two passes. The stamp is already written in the
 * merchant's own offset.
 */
function formatVerifiedAt(iso: string) {
  return `${iso.slice(0, 10)} ${iso.slice(11, 16)}`
}

/**
 * A merchant opens this screen to find out what to fix, so a failure never
 * sits below five passing rows. Everything else keeps the order the run
 * produced, which is what makes two runs comparable.
 */
function failuresFirst(cases: VerificationCase[]) {
  return [...cases].sort((a, b) => Number(a.passed) - Number(b.passed))
}

function CaseRow({
  verificationCase,
  locale,
  dict,
  onFix,
}: {
  verificationCase: VerificationCase
  locale: Locale
  dict: Dict
  onFix: (remediation: string) => void
}) {
  const [openQuote, closeQuote] = QUOTE_MARKS[locale]
  const failed = !verificationCase.passed
  const remediation = verificationCase.remediation?.[locale]

  // A passing advisory check recedes into the page: it is tracked and shown,
  // but it is not a thing anyone has to look at. Anything that failed gets a
  // hard edge whatever its severity.
  const variant =
    failed || verificationCase.severity === "gate" ? "outline" : "muted"

  return (
    <Item
      variant={variant}
      className={cn("items-start", failed && "border-destructive/40")}
    >
      <ItemMedia variant="icon">
        {verificationCase.passed ? (
          <CircleCheck
            aria-hidden
            className="text-emerald-600 dark:text-emerald-500"
          />
        ) : (
          <CircleX aria-hidden className="text-destructive" />
        )}
      </ItemMedia>

      <ItemContent>
        <ItemTitle className="block w-full line-clamp-none">
          {verificationCase.asserts[locale]}
        </ItemTitle>
        <ItemDescription className="font-mono text-xs line-clamp-none">
          {openQuote}
          {verificationCase.prompt}
          {closeQuote}
        </ItemDescription>
      </ItemContent>

      <ItemActions className="flex-col items-end gap-1 self-start sm:flex-row sm:items-center sm:gap-2">
        <Badge variant={verificationCase.severity === "gate" ? "default" : "outline"}>
          {verificationCase.severity === "gate"
            ? dict.verification.gate
            : dict.verification.soft}
        </Badge>
        <Badge variant="outline" className="font-mono">
          {verificationCase.lang.toUpperCase()}
        </Badge>
      </ItemActions>

      {failed && remediation ? (
        // Not a disclosure. A failed check is the one piece of work the owner
        // has left before publishing, so it reads as a task in the row itself.
        <ItemFooter className="mt-1">
          <div className="flex w-full flex-col gap-2.5 rounded-md bg-destructive/5 p-2.5 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
            <p className="flex items-start gap-2 text-sm text-foreground">
              <Wrench aria-hidden className="mt-0.5 size-3.5 shrink-0 text-destructive" />
              <span>{remediation}</span>
            </p>
            <Button
              size="sm"
              className="shrink-0 self-start sm:self-auto"
              onClick={() => onFix(remediation)}
            >
              {dict.verification.fixThis}
            </Button>
          </div>
        </ItemFooter>
      ) : null}
    </Item>
  )
}

function CaseSection({
  title,
  cases,
  locale,
  dict,
  onFix,
}: {
  title: string
  cases: VerificationCase[]
  locale: Locale
  dict: Dict
  onFix: (remediation: string) => void
}) {
  if (cases.length === 0) return null

  const passed = cases.filter((c) => c.passed).length

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">{title}</CardTitle>
        <CardAction>
          <Badge variant="secondary" className="font-mono tabular-nums">
            {passed}/{cases.length}
          </Badge>
        </CardAction>
      </CardHeader>
      <CardContent>
        <ItemGroup className="gap-2">
          {cases.map((verificationCase) => (
            <CaseRow
              key={verificationCase.id}
              verificationCase={verificationCase}
              locale={locale}
              dict={dict}
              onFix={onFix}
            />
          ))}
        </ItemGroup>
      </CardContent>
    </Card>
  )
}

export function VerificationReport({
  locale,
  dict,
  agentId,
  cases,
  lastVerifiedAt,
}: {
  locale: Locale
  dict: Dict
  agentId: string
  cases: VerificationCase[]
  lastVerifiedAt: string | null
}) {
  const router = useRouter()
  const [running, setRunning] = React.useState(false)
  const [publishing, setPublishing] = React.useState(false)

  const gates = failuresFirst(cases.filter((c) => c.severity === "gate"))
  const advisory = failuresFirst(cases.filter((c) => c.severity === "soft"))

  // Only gates count towards the score and the bar. An advisory check is
  // tracked and reported, but it never stands between a merchant and going
  // live — otherwise "verified" stops meaning anything.
  const passed = gates.filter((c) => c.passed).length
  const total = gates.length
  const blocked = passed < total
  const percent = total === 0 ? 100 : Math.round((passed / total) * 100)
  const score = fill(dict.verification.passed, { passed, total })

  /**
   * Drives a real run: six sessions against this agent's actual
   * configuration, graded, persisted. It takes about a minute, which is why
   * the button stays disabled and named for the whole time rather than
   * flashing a spinner and returning.
   */
  async function runAgain() {
    if (running) return
    setRunning(true)
    try {
      const result = await startVerificationRun(agentId)
      if (!result.ok) {
        toast.error(dict.verification.title, { description: result.error })
        return
      }
      toast(dict.verification.title, {
        description: fill(dict.verification.passed, {
          passed: result.gatesPassed,
          total: result.gatesTotal,
        }),
      })
      // The report is server-rendered from the run we just wrote.
      router.refresh()
    } finally {
      setRunning(false)
    }
  }

  /**
   * Publishing is gated on the server, not by this button.
   *
   * The disabled state below is a courtesy — it tells the merchant why they
   * cannot ship yet. The refusal that matters happens in `publishAgent`,
   * which re-reads the latest run and compares its graded configuration
   * against the agent as it stands right now. Anyone can call a server
   * action; only one of these two checks is a gate.
   */
  async function publish() {
    if (publishing) return
    setPublishing(true)
    try {
      const result = await publishAgent(agentId)
      if (result.ok) {
        toast.success(dict.verification.published, {
          description: dict.verification.publishedHint,
        })
        router.refresh()
        return
      }
      const because: Record<string, string> = {
        never_verified: dict.verification.neverVerified,
        gates_failing: dict.verification.blockedHint,
        config_changed_since_verification: dict.verification.configChanged,
      }
      toast.error(dict.verification.publishFailed, {
        description: because[result.reason] ?? result.detail ?? result.reason,
      })
    } finally {
      setPublishing(false)
    }
  }


  function fix(remediation: string) {
    toast(dict.verification.fixThis, { description: remediation })
  }

  /*
    An agent nobody has verified has no run to report. Rendering the suite with
    red crosses would accuse it of failing checks it was never put through —
    and the header stat two clicks away already says "never verified", so the
    two screens would contradict each other about the same agent.
  */
  if (cases.length === 0) {
    return (
      <Empty className="border">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <CircleDashed />
          </EmptyMedia>
          <EmptyTitle>{dict.agents.neverVerified}</EmptyTitle>
          <EmptyDescription>{dict.verification.subtitle}</EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <Button onClick={runAgain} disabled={running}>
            {running ? <Spinner /> : <RefreshCw aria-hidden />}
            {dict.setup.finish}
          </Button>
        </EmptyContent>
      </Empty>
    )
  }

  return (
    <>
      <Card>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-3">
            <div className="min-w-0">
              <p className="text-xs text-muted-foreground">
                {dict.verification.subtitle}
              </p>
              <p className="mt-1 font-mono text-xl tracking-tight tabular-nums sm:text-2xl">
                {score}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" onClick={runAgain} disabled={running}>
                {running ? <Spinner /> : <RefreshCw aria-hidden />}
                {dict.verification.run}
              </Button>
              <Button onClick={publish} disabled={blocked || publishing}>
                {dict.common.publish}
              </Button>
            </div>
          </div>

          <Progress value={percent} aria-label={score} />

          <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs text-muted-foreground">
            <Clock aria-hidden className="size-3.5" />
            <span>{dict.agents.lastVerified}</span>
            <span className="font-mono tabular-nums">
              {lastVerifiedAt
                ? formatVerifiedAt(lastVerifiedAt)
                : dict.agents.neverVerified}
            </span>
          </div>

          {blocked ? (
            <Alert
              variant="destructive"
              className="border-destructive/30 bg-destructive/5"
            >
              <CircleX aria-hidden />
              <AlertTitle>{dict.verification.blocked}</AlertTitle>
              <AlertDescription>{dict.verification.blockedHint}</AlertDescription>
            </Alert>
          ) : (
            <Alert>
              <CircleCheck aria-hidden />
              <AlertTitle>{dict.verification.ready}</AlertTitle>
            </Alert>
          )}
        </CardContent>
      </Card>

      <CaseSection
        title={dict.verification.gate}
        cases={gates}
        locale={locale}
        dict={dict}
        onFix={fix}
      />

      <CaseSection
        title={dict.verification.soft}
        cases={advisory}
        locale={locale}
        dict={dict}
        onFix={fix}
      />
    </>
  )
}
