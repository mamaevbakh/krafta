"use client"

import { useOptimistic, useTransition } from "react"
import { usePathname, useRouter } from "next/navigation"

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import type { AgentStatus } from "@/lib/agents"
import { cn } from "@/lib/utils"

export type AgentStatusFilter = "all" | AgentStatus

export type AgentFilterOption = {
  value: AgentStatusFilter
  label: string
  count: number
}

/**
 * The list itself stays a Server Component — only the tab strip is client, and
 * the selected tab lives in the URL rather than in component state. That keeps
 * a filtered list shareable, survivable across a reload, and walkable with the
 * back button, which is what an owner checking "what's paused?" actually does.
 *
 * `useOptimistic` is what makes it feel local: the clicked tab highlights
 * immediately and reverts to whatever the server says once the RSC payload
 * lands, so a back/forward navigation can never leave the strip lying.
 */
export function AgentsStatusFilter({
  value,
  options,
  children,
}: {
  value: AgentStatusFilter
  options: AgentFilterOption[]
  children: React.ReactNode
}) {
  const router = useRouter()
  const pathname = usePathname()
  const [pending, startTransition] = useTransition()
  const [selected, setSelected] = useOptimistic<AgentStatusFilter>(value)

  function select(next: AgentStatusFilter) {
    if (next === selected) return
    startTransition(() => {
      setSelected(next)
      router.replace(
        next === "all" ? pathname : `${pathname}?status=${next}`,
        { scroll: false }
      )
    })
  }

  return (
    <Tabs
      value={selected}
      onValueChange={(next) => select(next as AgentStatusFilter)}
      className="gap-4"
    >
      {/*
        `justify-start` is load-bearing, not cosmetic: TabsList centres its
        children, so on a 375px phone the four tabs overflow equally to both
        sides and the first one sits at a negative offset no amount of
        scrolling can reach. Left-aligned, the overflow is all on the right
        where a swipe can get at it.
      */}
      <TabsList className="w-full max-w-full justify-start overflow-x-auto sm:w-fit">
        {options.map((option) => (
          <TabsTrigger key={option.value} value={option.value}>
            {option.label}
            {/*
              The counts are the first thing to go on a phone: with them the
              four tabs are wider than a 375px screen and "To'xtatilgan" falls
              off the edge, which reads as a broken strip rather than a
              scrollable one. The labels are what an owner is looking for.
            */}
            <span className="hidden font-mono text-xs tabular-nums opacity-60 sm:inline">
              {option.count}
            </span>
          </TabsTrigger>
        ))}
      </TabsList>
      <TabsContent
        value={selected}
        className={cn(
          "transition-opacity duration-150",
          pending && "opacity-60"
        )}
      >
        {children}
      </TabsContent>
    </Tabs>
  )
}
