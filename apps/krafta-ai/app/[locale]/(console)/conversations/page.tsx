import Link from "next/link"
import { ArrowUpRight, MessagesSquare } from "lucide-react"

import { PageBody, PageHeader } from "@/components/console/page-header"
import { Badge } from "@/components/ui/badge"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"
import { Item, ItemContent, ItemGroup, ItemTitle } from "@/components/ui/item"
import { listConversations } from "@/lib/conversations"
import { getDict, type Locale } from "@/lib/i18n"

/**
 * Every conversation the business's agents have had.
 *
 * The merchant's real question about an AI talking to their customers is "what
 * did it say to them", and until now there was no screen that answered it.
 *
 * Escalations sort to the top of a merchant's attention by being the loudest
 * thing in the row, not by being reordered — the list stays chronological,
 * because "what happened most recently" is how anyone reads an inbox.
 */
export default async function ConversationsPage({
  params,
}: {
  params: Promise<{ locale: Locale }>
}) {
  const { locale } = await params
  const dict = getDict(locale)
  const conversations = await listConversations({ limit: 100 })

  return (
    <>
      <PageHeader
        title={dict.conversations.title}
        subtitle={dict.conversations.subtitle}
      />
      <PageBody>
        {conversations.length === 0 ? (
          <Empty className="border">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <MessagesSquare />
              </EmptyMedia>
              <EmptyTitle>{dict.conversations.emptyTitle}</EmptyTitle>
              <EmptyDescription>{dict.conversations.emptyHint}</EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <ItemGroup className="gap-2">
            {conversations.map((c) => (
              <Link
                key={c.id}
                href={`/${locale}/conversations/${c.id}`}
                className="rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
              >
                <Item variant="outline" className="hover:bg-muted/50">
                  <ItemContent>
                    <ItemTitle className="flex flex-wrap items-center gap-2">
                      <span className="truncate">
                        {c.opener ?? dict.conversations.noOpener}
                      </span>
                      {c.status === "escalated" ? (
                        <Badge variant="secondary" className="font-normal">
                          <ArrowUpRight />
                          {c.escalatedTo ?? dict.conversations.escalated}
                        </Badge>
                      ) : null}
                      {/*
                        A merchant testing their own draft must never be
                        mistaken for a real customer — it is the difference
                        between "nobody is using this" and "it is working".
                      */}
                      {c.origin !== "customer" ? (
                        <Badge variant="outline" className="font-normal">
                          {c.origin === "preview"
                            ? dict.conversations.originPreview
                            : dict.conversations.originVerification}
                        </Badge>
                      ) : null}
                    </ItemTitle>
                    <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                      <span>{c.agentName ?? dict.conversations.unnamedAgent}</span>
                      <span aria-hidden>·</span>
                      <span className="font-mono uppercase">{c.channel}</span>
                      <span aria-hidden>·</span>
                      <span className="font-mono tabular-nums">
                        {c.messageCount}
                      </span>
                      <span aria-hidden>·</span>
                      <time dateTime={c.lastMessageAt}>
                        {new Date(c.lastMessageAt).toLocaleString(locale)}
                      </time>
                    </div>
                  </ItemContent>
                </Item>
              </Link>
            ))}
          </ItemGroup>
        )}
      </PageBody>
    </>
  )
}
