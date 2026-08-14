import { Separator } from "@/components/ui/separator"
import { SidebarTrigger } from "@/components/ui/sidebar"

export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string
  subtitle?: string
  actions?: React.ReactNode
}) {
  return (
    <header className="sticky top-0 z-10 flex shrink-0 items-center gap-2 border-b bg-background/95 px-4 py-3 backdrop-blur supports-[backdrop-filter]:bg-background/75">
      <SidebarTrigger className="-ml-1" />
      <Separator orientation="vertical" className="mr-1 h-4" />
      <div className="min-w-0 flex-1">
        <h1 className="truncate text-sm font-medium">{title}</h1>
        {subtitle ? (
          <p className="truncate text-xs text-muted-foreground">{subtitle}</p>
        ) : null}
      </div>
      {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
    </header>
  )
}

export function PageBody({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-1 flex-col gap-6 p-4 md:p-6">{children}</div>
}
