import { createClient } from "@supabase/supabase-js"
import { FileText } from "lucide-react"

import { AddKnowledgeForm } from "@/components/console/knowledge-add-form"
import { PageBody, PageHeader } from "@/components/console/page-header"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
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
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemMedia,
  ItemTitle,
} from "@/components/ui/item"
import { getSelectedOrg } from "@/lib/orgs"
import { getDict, type Dict, type Locale } from "@/lib/i18n"

type DocRow = {
  id: string
  title: string
  status: string
  chunk_count: number
  byte_size: number | null
  lang: string | null
  error: string | null
  created_at: string
}

/**
 * The company's knowledge base — the corpus the agent is allowed to answer
 * from, and nothing else.
 *
 * Read with the service role rather than the user's client. `agent.documents`
 * is readable under RLS by any member, but this page also needs the derived
 * chunk counts to be trustworthy, and scoping by `org_id` from
 * `getSelectedOrg()` (which re-checks membership) keeps one rule for the whole
 * screen instead of two.
 */
async function listDocuments(orgId: string): Promise<DocRow[]> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SECRET_KEY
  if (!url || !key) return []

  const db = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
    db: { schema: "agent" },
  })

  const { data } = await db
    .from("documents")
    .select("id, title, status, chunk_count, byte_size, lang, error, created_at")
    .eq("org_id", orgId)
    .neq("status", "superseded")
    .order("created_at", { ascending: false })
    .limit(100)

  return (data ?? []) as unknown as DocRow[]
}

function statusLabel(status: string, dict: Dict): string {
  switch (status) {
    case "ready":
      return dict.knowledge.ready
    case "processing":
      return dict.knowledge.processing
    case "failed":
      return dict.knowledge.failed
    case "pending":
      return dict.knowledge.pending
    default:
      return dict.knowledge.superseded
  }
}

export default async function KnowledgePage({
  params,
}: {
  params: Promise<{ locale: string }>
}) {
  const { locale } = (await params) as { locale: Locale }
  const dict = getDict(locale)
  const org = await getSelectedOrg()
  const docs = org ? await listDocuments(org.id) : []

  const readyChunks = docs
    .filter((d) => d.status === "ready")
    .reduce((sum, d) => sum + (d.chunk_count ?? 0), 0)

  return (
    <>
      <PageHeader
        title={dict.knowledge.title}
        subtitle={dict.knowledge.subtitle}
        actions={
          readyChunks > 0 ? (
            <Badge variant="secondary" className="font-mono tabular-nums">
              {readyChunks} {dict.knowledge.chunks}
            </Badge>
          ) : null
        }
      />
      <PageBody>
        <AddKnowledgeForm dict={dict} />

        {docs.length === 0 ? (
          <Empty>
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <FileText />
              </EmptyMedia>
              <EmptyTitle>{dict.knowledge.empty}</EmptyTitle>
              <EmptyDescription>{dict.knowledge.emptyHint}</EmptyDescription>
            </EmptyHeader>
            <EmptyContent />
          </Empty>
        ) : (
          <Card>
            <CardContent>
              <ItemGroup>
                {docs.map((doc) => (
                  <Item key={doc.id} variant="outline" className="rounded-lg">
                    <ItemMedia variant="icon">
                      <FileText />
                    </ItemMedia>
                    <ItemContent>
                      <ItemTitle className="flex flex-wrap items-center gap-2">
                        {doc.title}
                        <Badge
                          variant={
                            doc.status === "failed"
                              ? "destructive"
                              : doc.status === "ready"
                                ? "outline"
                                : "secondary"
                          }
                          className="font-normal"
                        >
                          {statusLabel(doc.status, dict)}
                        </Badge>
                        {doc.lang ? (
                          <Badge variant="outline" className="font-mono font-normal">
                            {doc.lang}
                          </Badge>
                        ) : null}
                      </ItemTitle>
                      <ItemDescription className="flex flex-wrap items-center gap-x-3">
                        <span className="font-mono tabular-nums">
                          {doc.chunk_count} {dict.knowledge.chunks}
                        </span>
                        {doc.byte_size ? (
                          <span className="font-mono tabular-nums">
                            {Math.max(1, Math.round(doc.byte_size / 1024))} KB
                          </span>
                        ) : null}
                        <span className="font-mono tabular-nums">
                          {new Date(doc.created_at).toISOString().slice(0, 10)}
                        </span>
                      </ItemDescription>
                      {/* A failed document is the one thing on this screen a
                          merchant must act on, so the reason is shown inline
                          rather than hidden behind a click. */}
                      {doc.status === "failed" && doc.error ? (
                        <Alert variant="destructive" className="mt-2">
                          <AlertDescription className="font-mono text-xs">
                            {doc.error}
                          </AlertDescription>
                        </Alert>
                      ) : null}
                    </ItemContent>
                  </Item>
                ))}
              </ItemGroup>
            </CardContent>
          </Card>
        )}
      </PageBody>
    </>
  )
}
