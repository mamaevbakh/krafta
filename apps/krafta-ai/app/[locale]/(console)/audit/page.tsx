import { ScrollText } from "lucide-react"

import { AUDIT_COLUMNS } from "@/components/console/audit-columns"
import { AuditExportButton } from "@/components/console/audit-export-button"
import { PageBody, PageHeader } from "@/components/console/page-header"
import { Card, CardContent } from "@/components/ui/card"
import {
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { listAudit, listAuditTools, type AuditFilters } from "@/lib/audit"
import { listAgents } from "@/lib/agents"
import { getSelectedOrg } from "@/lib/orgs"
import { AuditFilterBar } from "@/components/console/audit-filter-bar"
import { getDict, type Locale } from "@/lib/i18n"

/**
 * Digits only, and pinned to Tashkent — a log where the timestamp shifts with
 * the reader's browser is a log nobody can cite in an argument. Numeric parts
 * read the same in all three locales, so one formatter serves every one.
 */
const AT = new Intl.DateTimeFormat("ru-RU", {
  timeZone: "Asia/Tashkent",
  day: "2-digit",
  month: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
})

const MS = new Intl.NumberFormat("ru-RU")

/** Query params are user input, so they are narrowed rather than trusted. */
function one(raw: string | string[] | undefined): string | undefined {
  const value = Array.isArray(raw) ? raw[0] : raw
  return value && value.trim() !== "" ? value.trim() : undefined
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

export default async function AuditPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: Locale }>
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
  const { locale } = await params
  const query = await searchParams
  const dict = getDict(locale)

  const org = await getSelectedOrg()

  const from = one(query.from)
  const to = one(query.to)
  const filters: AuditFilters = {
    agentId: one(query.agent),
    tool: one(query.tool),
    actorKind: one(query.actor),
    // A malformed date must not reach the query builder as a range bound.
    from: from && ISO_DATE.test(from) ? from : undefined,
    to: to && ISO_DATE.test(to) ? to : undefined,
  }

  const [AUDIT, tools, agents] = org
    ? await Promise.all([
        listAudit(org.id, filters),
        listAuditTools(org.id),
        listAgents(org.id),
      ])
    : [[], [], []]

  return (
    <>
      <PageHeader
        title={dict.audit.title}
        subtitle={dict.audit.subtitle}
        actions={<AuditExportButton label={dict.audit.exportCsv} rows={AUDIT} />}
      />
      <PageBody>
        <AuditFilterBar
          dict={dict}
          tools={tools}
          agents={agents.map((a) => ({ id: a.id, name: a.name }))}
          selected={filters}
        />
        {AUDIT.length === 0 ? (
          <Empty className="border">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <ScrollText />
              </EmptyMedia>
              <EmptyTitle>{dict.audit.empty}</EmptyTitle>
            </EmptyHeader>
          </Empty>
        ) : (
          <Card>
            <CardContent>
              {/* Six columns will not fit a phone. The table scrolls inside
                  this box; the page itself never scrolls sideways. */}
              <div className="w-full overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-xs text-muted-foreground">
                        {AUDIT_COLUMNS.time[locale]}
                      </TableHead>
                      <TableHead className="text-xs text-muted-foreground">
                        {dict.common.agent}
                      </TableHead>
                      <TableHead className="text-xs text-muted-foreground">
                        {dict.approvals.requestedBy}
                      </TableHead>
                      <TableHead className="text-xs text-muted-foreground">
                        {AUDIT_COLUMNS.tool[locale]}
                      </TableHead>
                      <TableHead className="text-xs text-muted-foreground">
                        {AUDIT_COLUMNS.result[locale]}
                      </TableHead>
                      <TableHead className="text-right text-xs text-muted-foreground">
                        {AUDIT_COLUMNS.duration[locale]}
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {AUDIT.map((entry) => (
                      <TableRow key={entry.id}>
                        <TableCell className="font-mono text-xs tabular-nums text-muted-foreground">
                          {AT.format(new Date(entry.at))}
                        </TableCell>
                        <TableCell className="font-medium">
                          {entry.agentName ?? entry.agentId ?? "—"}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {entry.actor}
                        </TableCell>
                        <TableCell className="font-mono text-xs">
                          {entry.tool}
                        </TableCell>
                        <TableCell>{entry.result}</TableCell>
                        <TableCell className="text-right font-mono text-xs tabular-nums text-muted-foreground">
                          {entry.latencyMs === null ? "—" : `${MS.format(entry.latencyMs)} ms`}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        )}
      </PageBody>
    </>
  )
}
