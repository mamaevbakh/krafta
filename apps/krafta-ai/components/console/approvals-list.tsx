"use client"

import * as React from "react"
import {
  Check,
  CheckCheck,
  Clock,
  Hourglass,
  Send,
  SquareTerminal,
  X,
} from "lucide-react"
import { toast } from "sonner"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemMedia,
  ItemTitle,
} from "@/components/ui/item"
import { APPROVALS, type Approval } from "@/lib/mock/data"
import type { Dict, Locale } from "@/lib/i18n"
import { cn } from "@/lib/utils"

/**
 * Past this, the row stops being "the agent is checking with you" and starts
 * being "a customer is sitting on hold". Tinted, not shouted.
 */
const IMPATIENT_MINUTES = 15

/**
 * `surface` is where the request landed, and it matters: the same approval is
 * pushed to Telegram, so a manager can answer from their phone and whoever
 * touches it first wins. Rendered as a mono identifier rather than prose —
 * these are system surfaces, not translated words.
 */
const SURFACE_ICON: Record<Approval["surface"], typeof Send> = {
  console: SquareTerminal,
  telegram: Send,
}

export function ApprovalsList({
  locale,
  dict,
}: {
  locale: Locale
  dict: Dict
}) {
  // UI-first: deciding is local state. The row leaves the list, a toast
  // confirms what was decided, and nothing is sent anywhere.
  const [pending, setPending] = React.useState<Approval[]>(APPROVALS)

  function decide(approval: Approval, approved: boolean) {
    setPending((rows) => rows.filter((row) => row.id !== approval.id))

    const description = `${
      approved ? dict.approvals.approve : dict.approvals.reject
    } · ${approval.tool}`

    if (approved) {
      toast.success(approval.summary[locale], { description })
    } else {
      toast(approval.summary[locale], {
        description,
        icon: <X className="size-4" />,
      })
    }
  }

  if (pending.length === 0) {
    return (
      <Empty className="border">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <CheckCheck />
          </EmptyMedia>
          <EmptyTitle>{dict.approvals.empty}</EmptyTitle>
        </EmptyHeader>
      </Empty>
    )
  }

  return (
    <ItemGroup className="gap-3">
      {pending.map((approval) => {
        const SurfaceIcon = SURFACE_ICON[approval.surface]
        const impatient = approval.waitingMinutes >= IMPATIENT_MINUTES

        return (
          <Item key={approval.id} variant="outline">
            <ItemMedia variant="icon">
              <Hourglass
                className={cn(
                  "text-muted-foreground",
                  impatient && "text-amber-600 dark:text-amber-500"
                )}
              />
            </ItemMedia>

            <ItemContent className="gap-1.5">
              <ItemTitle className="line-clamp-none w-full">
                {approval.summary[locale]}
              </ItemTitle>
              <ItemDescription className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs">
                <span className="font-mono">{approval.tool}</span>
                <Badge
                  variant="outline"
                  className="gap-1 font-mono font-normal lowercase"
                >
                  <SurfaceIcon />
                  {approval.surface}
                </Badge>
                <span>
                  {dict.approvals.requestedBy}: {approval.requestedBy}
                </span>
                <span
                  className={cn(
                    "inline-flex items-center gap-1",
                    impatient && "text-amber-600 dark:text-amber-500"
                  )}
                >
                  <Clock className="size-3.5" />
                  <span className="font-mono tabular-nums">
                    {approval.waitingMinutes} {dict.templates.minutes}
                  </span>
                  <span>{dict.approvals.waiting}</span>
                </span>
              </ItemDescription>
            </ItemContent>

            <ItemActions className="w-full justify-end sm:w-auto">
              <Button size="sm" onClick={() => decide(approval, true)}>
                <Check />
                {dict.approvals.approve}
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => decide(approval, false)}
              >
                <X />
                {dict.approvals.reject}
              </Button>
            </ItemActions>
          </Item>
        )
      })}
    </ItemGroup>
  )
}
