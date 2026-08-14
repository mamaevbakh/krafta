import { notFound } from "next/navigation"
import { ArrowLeft, ArrowUpRight, Bot, Wrench } from "lucide-react"

import { ButtonLink } from "@/components/console/button-link"
import { PageBody, PageHeader } from "@/components/console/page-header"
import { Badge } from "@/components/ui/badge"
import { Bubble, BubbleContent } from "@/components/ui/bubble"
import { Marker, MarkerContent, MarkerIcon } from "@/components/ui/marker"
import {
  Message,
  MessageAvatar,
  MessageContent,
} from "@/components/ui/message"
import { getThread } from "@/lib/conversations"
import { fill, getDict, type Locale } from "@/lib/i18n"

/**
 * One conversation, read the way the customer experienced it.
 *
 * Same composition as the merchant's own preview on purpose: speech is a
 * bubble, a tool run is a quiet marker, and a handoff is a break in the
 * thread. Flattening tool activity into chat bubbles is the fastest way to
 * mislead an owner about what their agent actually said — it makes the agent
 * look like it CLAIMED to check stock when what happened is that it did.
 */
export default async function ThreadPage({
  params,
}: {
  params: Promise<{ locale: Locale; id: string }>
}) {
  const { locale, id } = await params
  const dict = getDict(locale)

  const thread = await getThread(id)
  // Null covers both "does not exist" and "belongs to another business" —
  // row-level security makes them indistinguishable, which is the point.
  if (!thread) notFound()

  const { conversation, messages } = thread

  return (
    <>
      <PageHeader
        title={conversation.agentName ?? dict.conversations.unnamedAgent}
        subtitle={fill(dict.conversations.startedAt, {
          when: new Date(conversation.startedAt).toLocaleString(locale),
        })}
      />
      <PageBody>
        <div className="flex flex-wrap items-center gap-2">
          <ButtonLink
            href={`/${locale}/conversations`}
            variant="outline"
            size="sm"
          >
            <ArrowLeft />
            {dict.common.back}
          </ButtonLink>
          <Badge variant="outline" className="font-mono uppercase">
            {conversation.channel}
          </Badge>
          {conversation.status === "escalated" ? (
            <Badge variant="secondary" className="font-normal">
              <ArrowUpRight />
              {conversation.escalatedTo ?? dict.conversations.escalated}
            </Badge>
          ) : null}
          {conversation.origin !== "customer" ? (
            <Badge variant="outline" className="font-normal">
              {conversation.origin === "preview"
                ? dict.conversations.originPreview
                : dict.conversations.originVerification}
            </Badge>
          ) : null}
        </div>

        <div className="mx-auto flex w-full max-w-2xl flex-col gap-4">
          {messages.map((m) => {
            if (m.role === "user") {
              return (
                <Message key={m.seq} align="end">
                  <MessageContent>
                    <Bubble>
                      <BubbleContent>{m.content}</BubbleContent>
                    </Bubble>
                  </MessageContent>
                </Message>
              )
            }

            if (m.role === "assistant") {
              return (
                <Message key={m.seq} align="start">
                  <MessageAvatar className="size-8">
                    <Bot className="size-4 text-muted-foreground" />
                  </MessageAvatar>
                  <MessageContent>
                    <Bubble variant="outline">
                      <BubbleContent>{m.content}</BubbleContent>
                    </Bubble>
                  </MessageContent>
                </Message>
              )
            }

            if (m.role === "escalation") {
              return (
                <Marker key={m.seq} variant="separator">
                  <MarkerIcon>
                    <ArrowUpRight />
                  </MarkerIcon>
                  <MarkerContent>
                    {fill(dict.preview.escalated, {
                      person: m.escalatedTo ?? dict.conversations.escalated,
                    })}
                    {m.content ? (
                      <span className="ml-2 text-foreground/70">{m.content}</span>
                    ) : null}
                  </MarkerContent>
                </Marker>
              )
            }

            return (
              <Marker key={m.seq}>
                <MarkerIcon>
                  <Wrench />
                </MarkerIcon>
                <MarkerContent>
                  {fill(dict.preview.usedTool, { tool: m.toolName ?? "" })}
                  {m.toolDetail ? (
                    <span className="ml-2 font-mono text-xs text-foreground/70">
                      {m.toolDetail}
                    </span>
                  ) : null}
                </MarkerContent>
              </Marker>
            )
          })}
        </div>
      </PageBody>
    </>
  )
}
