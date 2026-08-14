import type { AgentStatus } from "@/lib/agents"
import { cn } from "@/lib/utils"

const TONE: Record<AgentStatus, string> = {
  live: "bg-emerald-500",
  draft: "bg-amber-500",
  paused: "bg-muted-foreground/40",
  // Archived agents are filtered out of every list, but the map must be
  // exhaustive or a stray status renders an unstyled dot rather than failing.
  archived: "bg-muted-foreground/20",
}

export function StatusDot({
  status,
  className,
}: {
  status: AgentStatus
  className?: string
}) {
  return (
    <span
      className={cn("relative flex size-2.5 items-center justify-center", className)}
    >
      <span className={cn("size-2 rounded-full", TONE[status])} />
      {status === "live" ? (
        <span className="absolute size-2 animate-ping rounded-full bg-emerald-500/60" />
      ) : null}
    </span>
  )
}
