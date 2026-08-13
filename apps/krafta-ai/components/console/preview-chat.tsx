"use client"

import * as React from "react"
import {
  AlertTriangle,
  ArrowUpRight,
  Bot,
  FileText,
  MessagesSquare,
  Paperclip,
  RotateCcw,
  SendHorizontal,
  Wrench,
  X,
} from "lucide-react"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import type { QuotaReason } from "@/lib/usage"

import {
  Attachment,
  AttachmentAction,
  AttachmentActions,
  AttachmentContent,
  AttachmentDescription,
  AttachmentGroup,
  AttachmentMedia,
  AttachmentTitle,
} from "@/components/ui/attachment"
import { Badge } from "@/components/ui/badge"
import { Bubble, BubbleContent } from "@/components/ui/bubble"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
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
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupText,
  InputGroupTextarea,
} from "@/components/ui/input-group"
import { Marker, MarkerContent, MarkerIcon } from "@/components/ui/marker"
import {
  Message,
  MessageAvatar,
  MessageContent,
  MessageHeader,
} from "@/components/ui/message"
import {
  MessageScroller,
  MessageScrollerButton,
  MessageScrollerContent,
  MessageScrollerItem,
  MessageScrollerProvider,
  MessageScrollerViewport,
  useMessageScroller,
} from "@/components/ui/message-scroller"
import { Spinner } from "@/components/ui/spinner"
import { useEveAgent } from "eve/react"

import type { PreviewTurn } from "@/lib/mock/data"
import { toPreviewTurns } from "@/lib/preview/turns"
import { fill, type Dict } from "@/lib/i18n"

/**
 * The owner talking to their own agent, for real.
 *
 * `useEveAgent` opens a durable session against the runtime agent mounted at
 * /eve/agents/runtime/eve/v1/*. Same-origin, so the browser's Krafta session
 * cookie rides along and the channel resolves the tenant from it — the preview
 * cannot reach another business's agent even if the id in the URL is changed.
 *
 * This is the DRAFT the merchant is editing, not the published agent their
 * customers talk to. Nothing here is metered as a customer conversation.
 */

type Attached = { name: string; sizeKb: number }

type Entry = {
  id: string
  turn: PreviewTurn
  attachment?: Attached
}


export function PreviewChat({
  dict,
  agentId,
  agentName,
  languages,
  blockedReason = null,
}: {
  dict: Dict
  agentId: string
  agentName: string
  languages: string[]
  /**
   * Resolved on the server before this page rendered. The runtime enforces the
   * same limit, but an eve `AuthFn` can only answer yes or no, so a refusal
   * arrives as a bare 401 and this component would otherwise show a spinner
   * that stops and nothing else. This prop is how the merchant learns why.
   */
  blockedReason?: QuotaReason | null
}) {
  return (
    <MessageScrollerProvider autoScroll>
      <PreviewConversation
        dict={dict}
        agentId={agentId}
        agentName={agentName}
        languages={languages}
        blockedReason={blockedReason}
      />
    </MessageScrollerProvider>
  )
}

function PreviewConversation({
  dict,
  agentId,
  agentName,
  languages,
  blockedReason,
}: {
  dict: Dict
  agentId: string
  agentName: string
  languages: string[]
  blockedReason: QuotaReason | null
}) {
  const { scrollToEnd } = useMessageScroller()

  const [draft, setDraft] = React.useState("")
  const [attachment, setAttachment] = React.useState<Attached | null>(null)
  const fileInput = React.useRef<HTMLInputElement>(null)

  const agent = useEveAgent({
    agent: "runtime",
    // Re-resolved before every request, reconnects included — which is what
    // makes this survive a dropped stream. The runtime re-checks the id
    // against the caller's organisation, so this is a hint, not a grant.
    headers: () => ({ "x-krafta-agent-id": agentId }),
  })

  const pending = agent.status === "submitted" || agent.status === "streaming"

  /**
   * Two ways this screen goes quiet, and the merchant must be told about both.
   *
   * `blockedReason` is the limit as it stood when the page was rendered.
   * `agent.status === "error"` catches the case that matters more: they were
   * inside the limit when they opened the page, sent messages until they
   * crossed it, and the next send was refused. Without this branch that
   * refusal is invisible — the spinner simply stops and no bubble appears.
   *
   * The live case cannot name the reason (a 401 carries none), so it falls
   * back to the generic line rather than guessing at a specific limit.
   */
  const stopped: QuotaReason | null =
    blockedReason ?? (agent.status === "error" ? "quota_check_failed" : null)

  const entries: Entry[] = React.useMemo(
    () =>
      toPreviewTurns(agent.data.messages).map((turn, index) => ({
        id: `turn-${index}`,
        turn,
      })),
    [agent.data.messages]
  )

  // Follow the conversation as it streams rather than only on send: a long
  // answer that grows past the fold would otherwise scroll out of sight.
  React.useEffect(() => {
    window.requestAnimationFrame(() => scrollToEnd())
  }, [entries.length, scrollToEnd])

  function send() {
    const text = draft.trim()
    // `stopped` too: the button is disabled, but Enter-to-send and a stale
    // form submit both reach here, and a send that is going to be refused
    // should not clear what the merchant typed.
    if (!text || pending || stopped) return

    setDraft("")
    setAttachment(null)
    void agent.send(text)
    window.requestAnimationFrame(() => scrollToEnd())
  }

  function reset() {
    // Clears the local cursor so the next message starts a fresh durable
    // session. The old session keeps existing server-side; this is the
    // owner clearing their screen, not deleting history.
    agent.reset()
    setAttachment(null)
    setDraft("")
  }

  function pickFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (file) {
      setAttachment({
        name: file.name,
        sizeKb: Math.max(1, Math.round(file.size / 1024)),
      })
    }
    // Let the same file be chosen twice in a row.
    event.target.value = ""
  }

  return (
    <Card className="flex min-h-0 flex-1 flex-col">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-sm">
          {dict.preview.title}
          <Badge variant="outline" className="font-normal">
            {dict.common.draft}
          </Badge>
        </CardTitle>
        <CardDescription className="font-mono text-xs uppercase">
          {languages.join(" · ")}
        </CardDescription>
        <CardAction>
          <Button variant="ghost" size="sm" onClick={reset}>
            <RotateCcw />
            {dict.common.retry}
          </Button>
        </CardAction>
      </CardHeader>

      <CardContent className="flex min-h-0 flex-1 flex-col px-0">
        {stopped ? (
          <div className="mx-auto mb-2 w-full max-w-3xl px-4">
            <Alert variant="destructive">
              <AlertTriangle />
              <AlertTitle>{dict.budget.blockedTitle}</AlertTitle>
              <AlertDescription>{dict.budget[stopped]}</AlertDescription>
            </Alert>
          </div>
        ) : null}

        <MessageScroller className="min-h-0 flex-1">
          <MessageScrollerViewport>
            <MessageScrollerContent className="mx-auto w-full max-w-3xl gap-4 px-4 pb-2">
              {entries.length === 0 && !pending ? (
                <Empty className="my-auto border">
                  <EmptyHeader>
                    <EmptyMedia variant="icon">
                      <MessagesSquare />
                    </EmptyMedia>
                    <EmptyTitle>{dict.preview.emptyTitle}</EmptyTitle>
                    <EmptyDescription>{dict.preview.emptyHint}</EmptyDescription>
                  </EmptyHeader>
                  <EmptyContent />
                </Empty>
              ) : null}

              {entries.map((entry, index) => (
                <MessageScrollerItem key={entry.id} messageId={entry.id}>
                  <TurnView
                    entry={entry}
                    previous={entries[index - 1]}
                    agentName={agentName}
                    dict={dict}
                  />
                </MessageScrollerItem>
              ))}

              {pending ? (
                <MessageScrollerItem messageId="pending">
                  <Marker>
                    <MarkerIcon>
                      <Spinner />
                    </MarkerIcon>
                    <MarkerContent>{dict.preview.thinking}</MarkerContent>
                  </Marker>
                </MessageScrollerItem>
              ) : null}
            </MessageScrollerContent>
          </MessageScrollerViewport>
          <MessageScrollerButton />
        </MessageScroller>
      </CardContent>

      <CardFooter className="flex-col items-stretch gap-2">
        <form
          className="mx-auto w-full max-w-3xl"
          onSubmit={(event) => {
            event.preventDefault()
            send()
          }}
        >
          <input
            ref={fileInput}
            type="file"
            className="hidden"
            onChange={pickFile}
          />

          {attachment ? (
            <AttachmentGroup className="pb-2">
              <Attachment size="sm">
                <AttachmentMedia>
                  <FileText />
                </AttachmentMedia>
                <AttachmentContent>
                  <AttachmentTitle>{attachment.name}</AttachmentTitle>
                  <AttachmentDescription className="font-mono tabular-nums">
                    {attachment.sizeKb} KB
                  </AttachmentDescription>
                </AttachmentContent>
                <AttachmentActions>
                  <AttachmentAction
                    aria-label={dict.common.cancel}
                    onClick={() => setAttachment(null)}
                  >
                    <X />
                  </AttachmentAction>
                </AttachmentActions>
              </Attachment>
            </AttachmentGroup>
          ) : null}

          <InputGroup className="bg-background">
            <InputGroupTextarea
              value={draft}
              placeholder={dict.preview.placeholder}
              rows={2}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                if (
                  event.key === "Enter" &&
                  !event.shiftKey &&
                  !event.nativeEvent.isComposing
                ) {
                  event.preventDefault()
                  send()
                }
              }}
            />
            <InputGroupAddon align="block-end">
              <InputGroupButton
                size="icon-xs"
                aria-label={dict.common.open}
                onClick={() => fileInput.current?.click()}
              >
                <Paperclip />
              </InputGroupButton>
              {draft.length > 0 ? (
                <InputGroupText className="font-mono text-xs tabular-nums">
                  {draft.length}
                </InputGroupText>
              ) : null}
              <InputGroupButton
                type="submit"
                variant="default"
                className="ml-auto"
                disabled={draft.trim().length === 0 || pending || stopped !== null}
              >
                {pending ? <Spinner className="size-3.5" /> : <SendHorizontal />}
                {dict.preview.send}
              </InputGroupButton>
            </InputGroupAddon>
          </InputGroup>
        </form>
      </CardFooter>
    </Card>
  )
}

function TurnView({
  entry,
  previous,
  agentName,
  dict,
}: {
  entry: Entry
  previous: Entry | undefined
  agentName: string
  dict: Dict
}) {
  const turn = entry.turn

  switch (turn.kind) {
    case "user":
      return (
        <Message align="end">
          <MessageContent>
            {entry.attachment ? (
              <Attachment size="sm">
                <AttachmentMedia>
                  <FileText />
                </AttachmentMedia>
                <AttachmentContent>
                  <AttachmentTitle>{entry.attachment.name}</AttachmentTitle>
                  <AttachmentDescription className="font-mono tabular-nums">
                    {entry.attachment.sizeKb} KB
                  </AttachmentDescription>
                </AttachmentContent>
              </Attachment>
            ) : null}
            <Bubble>
              <BubbleContent>{turn.text}</BubbleContent>
            </Bubble>
          </MessageContent>
        </Message>
      )

    case "agent": {
      // Name the speaker once per run of consecutive agent lines.
      const showHeader = previous?.turn.kind !== "agent"
      return (
        <Message align="start">
          <MessageAvatar className="size-8">
            <Bot className="size-4 text-muted-foreground" />
          </MessageAvatar>
          <MessageContent>
            {showHeader ? (
              <MessageHeader className="gap-2">
                <span className="truncate">{agentName}</span>
              </MessageHeader>
            ) : null}
            <Bubble variant="outline">
              <BubbleContent>{turn.text}</BubbleContent>
            </Bubble>
          </MessageContent>
        </Message>
      )
    }

    case "tool":
      return (
        <Marker>
          <MarkerIcon>
            <Wrench />
          </MarkerIcon>
          <MarkerContent>
            {fill(dict.preview.usedTool, { tool: turn.tool })}
            <span className="ml-2 font-mono text-xs text-foreground/70">
              {turn.detail}
            </span>
          </MarkerContent>
        </Marker>
      )

    case "escalation":
      return (
        <Marker variant="separator">
          <MarkerIcon>
            <ArrowUpRight />
          </MarkerIcon>
          <MarkerContent>
            {fill(dict.preview.escalated, { person: turn.person })}
          </MarkerContent>
        </Marker>
      )
  }
}
