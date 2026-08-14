"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { useEveAgent } from "eve/react"
import {
  ArrowUp,
  Brain,
  ChevronRight,
  ExternalLink,
  Globe,
  Search,
  Sparkles,
  Wrench,
} from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Bubble, BubbleContent } from "@/components/ui/bubble"
import { Button, buttonVariants } from "@/components/ui/button"
import {
  Questionnaire,
  QuestionnaireActions,
  QuestionnaireChoice,
  QuestionnaireChoiceDescription,
  QuestionnaireChoices,
  QuestionnaireItem,
  QuestionnaireSubmit,
  QuestionnaireTitle,
} from "@/components/ui/questionnaire"
import { Card, CardContent } from "@/components/ui/card"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupTextarea,
} from "@/components/ui/input-group"
import { Marker, MarkerContent, MarkerIcon } from "@/components/ui/marker"
import { Message, MessageContent } from "@/components/ui/message"
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
import { toBuilderTimeline, type BuilderEntry } from "@/lib/builder/timeline"
import {
  pendingQuestion,
  writeSetupDraft,
  type AgentProposal,
  type PendingQuestion,
} from "@/lib/preview/proposal"
import { fill, type Dict, type Locale } from "@/lib/i18n"

/**
 * The agent builder — a working session, not a form.
 *
 * This replaces a box on the templates shelf that showed only the model's
 * latest sentence. The interview now researches the business and asks two to
 * four branching questions, and none of that is legible in a single line of
 * text. An owner who watches it look their company up and then ask a sharp
 * question trusts the thing it builds; an owner who stares at a spinner does
 * not.
 *
 * So the transcript keeps the four shapes distinct — thinking, work, speech,
 * proposal — rather than flattening them into chat bubbles. Tool runs collapse
 * into one openable line, because three searches in a row is one fact
 * ("it looked us up"), not three.
 */
export function AgentBuilder({
  dict,
  locale,
  initialPrompt,
}: {
  dict: Dict
  locale: Locale
  /** Carried from the landing box so the owner never types it twice. */
  initialPrompt?: string
}) {
  return (
    <MessageScrollerProvider autoScroll>
      <BuilderConversation
        dict={dict}
        locale={locale}
        initialPrompt={initialPrompt}
      />
    </MessageScrollerProvider>
  )
}

function BuilderConversation({
  dict,
  locale,
  initialPrompt,
}: {
  dict: Dict
  locale: Locale
  initialPrompt?: string
}) {
  const router = useRouter()
  const { scrollToEnd } = useMessageScroller()
  const [draft, setDraft] = React.useState("")

  const agent = useEveAgent({ agent: "onboarding" })
  const busy = agent.status === "submitted" || agent.status === "streaming"

  const entries = React.useMemo(
    () => toBuilderTimeline(agent.data.messages),
    [agent.data.messages]
  )
  const question = pendingQuestion(agent.data.messages)

  /**
   * Send the prompt the owner already typed on the previous screen, once.
   *
   * A ref rather than a state flag: this must not re-fire when the effect's
   * dependencies change mid-stream, and sending the opening message twice
   * would start the interview over on top of itself.
   */
  const sent = React.useRef(false)
  React.useEffect(() => {
    const opening = initialPrompt?.trim()
    if (!opening || sent.current) return
    sent.current = true
    void agent.send(opening)
  }, [initialPrompt, agent])

  React.useEffect(() => {
    window.requestAnimationFrame(() => scrollToEnd())
  }, [entries.length, scrollToEnd])

  function send() {
    const text = draft.trim()
    if (!text || busy) return
    setDraft("")
    void agent.send(text)
    window.requestAnimationFrame(() => scrollToEnd())
  }

  function accept(proposal: AgentProposal) {
    writeSetupDraft(proposal)
    router.push(`/${locale}/templates/${proposal.templateSlug}/setup`)
  }

  const started = entries.length > 0 || busy

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <MessageScroller className="min-h-0 flex-1">
        <MessageScrollerViewport>
          <MessageScrollerContent className="mx-auto w-full max-w-2xl gap-4 px-4 pb-4">
            {!started ? (
              <div className="my-auto flex flex-col gap-1.5 py-12">
                <h1 className="flex items-center gap-2 text-lg font-medium">
                  <Sparkles className="size-4 text-muted-foreground" />
                  {dict.builder.title}
                </h1>
                <p className="text-sm text-pretty text-muted-foreground">
                  {dict.builder.subtitle}
                </p>
              </div>
            ) : null}

            {entries.map((entry) => (
              <MessageScrollerItem key={entry.id} messageId={entry.id}>
                <EntryView entry={entry} dict={dict} onAccept={accept} />
              </MessageScrollerItem>
            ))}

            {question ? (
              <MessageScrollerItem messageId="question">
                <QuestionCard
                  // Remounts per question, so a fresh one never inherits the
                  // previous answer's checked state.
                  key={question.requestId}
                  question={question}
                  dict={dict}
                  disabled={busy}
                  onAnswer={(response) => void agent.respond([response])}
                />
              </MessageScrollerItem>
            ) : null}

            {busy && !question ? (
              <MessageScrollerItem messageId="pending">
                <Marker>
                  <MarkerIcon>
                    <Spinner />
                  </MarkerIcon>
                  <MarkerContent>{dict.builder.thinking}</MarkerContent>
                </Marker>
              </MessageScrollerItem>
            ) : null}
          </MessageScrollerContent>
        </MessageScrollerViewport>
        <MessageScrollerButton />
      </MessageScroller>

      <div className="border-t bg-background px-4 py-3">
        <form
          className="mx-auto w-full max-w-2xl"
          onSubmit={(event) => {
            event.preventDefault()
            send()
          }}
        >
          <InputGroup className="bg-background">
            <InputGroupTextarea
              value={draft}
              rows={2}
              placeholder={
                question?.allowFreeform
                  ? dict.templates.describePlaceholder
                  : dict.builder.placeholder
              }
              aria-label={dict.builder.title}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                // Enter sends, Shift+Enter breaks the line — the grammar of
                // every chat box this owner already uses. IME composition
                // must never be interrupted.
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
                type="submit"
                size="sm"
                variant="default"
                className="ml-auto"
                disabled={draft.trim().length === 0 || busy}
              >
                {busy ? <Spinner className="size-3.5" /> : <ArrowUp />}
                {dict.builder.send}
              </InputGroupButton>
            </InputGroupAddon>
          </InputGroup>
        </form>
      </div>
    </div>
  )
}

/**
 * The agent's question, as a real question card.
 *
 * eve's HITL response is strict — `{ requestId, optionId?, text? }`, one
 * option — so there is no native multi-select. Rather than pretend otherwise,
 * this renders radio choices normally, and only offers checkboxes when the
 * request allows freeform, because that is the one case where several picks
 * can be sent honestly (joined into `text`). Offering checkboxes without that
 * would let an owner tick three boxes and have two silently dropped.
 */
function QuestionCard({
  question,
  dict,
  disabled,
  onAnswer,
}: {
  question: PendingQuestion
  dict: Dict
  disabled: boolean
  onAnswer: (response: {
    requestId: string
    optionId?: string
    text?: string
  }) => void
}) {
  const multiple = question.allowFreeform && question.options.length > 1

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (disabled) return

    const data = new FormData(event.currentTarget)
    const picked = data.getAll("answer").map(String).filter(Boolean)
    if (picked.length === 0) return

    if (!multiple) {
      onAnswer({ requestId: question.requestId, optionId: picked[0] })
      return
    }

    // Several picks can only travel as text. Send the LABELS, not our option
    // ids — the model reads this, and `opt_2` tells it nothing.
    const labels = picked.map(
      (id) => question.options.find((o) => o.id === id)?.label ?? id
    )
    onAnswer({ requestId: question.requestId, text: labels.join(", ") })
  }

  return (
    <Questionnaire onSubmit={submit}>
      <QuestionnaireItem name="answer" multiple={multiple} required>
        <QuestionnaireTitle>{question.prompt}</QuestionnaireTitle>
        <QuestionnaireChoices>
          {question.options.map((option) => (
            <QuestionnaireChoice key={option.id} value={option.id} disabled={disabled}>
              {option.label}
              {option.description ? (
                <QuestionnaireChoiceDescription>
                  {option.description}
                </QuestionnaireChoiceDescription>
              ) : null}
            </QuestionnaireChoice>
          ))}
        </QuestionnaireChoices>
        <QuestionnaireActions>
          <QuestionnaireSubmit
            className={buttonVariants({ size: "sm" })}
            disabled={disabled}
          >
            {dict.builder.send}
          </QuestionnaireSubmit>
        </QuestionnaireActions>
      </QuestionnaireItem>
    </Questionnaire>
  )
}

/** Known tools get human words; anything new falls back to its own name. */
function toolLabel(tool: string, dict: Dict): string {
  if (tool === "web_search") return dict.builder.toolWebSearch
  if (tool === "web_fetch") return dict.builder.toolWebFetch
  return tool
}

function EntryView({
  entry,
  dict,
  onAccept,
}: {
  entry: BuilderEntry
  dict: Dict
  onAccept: (proposal: AgentProposal) => void
}) {
  switch (entry.kind) {
    case "user":
      return (
        <Message align="end">
          <MessageContent>
            <Bubble>
              <BubbleContent>{entry.text}</BubbleContent>
            </Bubble>
          </MessageContent>
        </Message>
      )

    case "speech":
      return <p className="pl-1 text-sm text-pretty">{entry.text}</p>

    case "thinking":
      // Collapsed by default. The reasoning is there for the owner who wants
      // to know why it asked what it asked, not for everyone every time.
      return (
        <Collapsible>
          <CollapsibleTrigger className="group flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground">
            {entry.streaming ? (
              <Spinner className="size-3" />
            ) : (
              <Brain className="size-3" />
            )}
            {dict.builder.thought}
            <ChevronRight className="size-3 transition-transform group-data-[panel-open]:rotate-90" />
          </CollapsibleTrigger>
          <CollapsibleContent>
            <p className="mt-1.5 border-l pl-3 text-xs whitespace-pre-wrap text-muted-foreground">
              {entry.text}
            </p>
          </CollapsibleContent>
        </Collapsible>
      )

    case "work": {
      const count = entry.steps.length
      const running = entry.steps.some((s) => s.running)
      return (
        <Collapsible>
          <CollapsibleTrigger className="group flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground">
            {running ? (
              <Spinner className="size-3" />
            ) : (
              <Wrench className="size-3" />
            )}
            {count === 1
              ? dict.builder.workOne
              : fill(dict.builder.workMany, { count: String(count) })}
            <ChevronRight className="size-3 transition-transform group-data-[panel-open]:rotate-90" />
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div className="mt-1.5 flex flex-col gap-1 border-l pl-3">
              {entry.steps.map((step, index) => (
                <div
                  key={`${step.tool}-${index}`}
                  className="flex flex-col gap-1"
                >
                  <div className="flex items-baseline gap-2 text-xs">
                    {step.tool === "web_search" ? (
                      <Search className="size-3 shrink-0 self-center text-muted-foreground" />
                    ) : (
                      <Globe className="size-3 shrink-0 self-center text-muted-foreground" />
                    )}
                    <span className="text-muted-foreground">
                      {toolLabel(step.tool, dict)}
                    </span>
                    {step.detail ? (
                      <span className="truncate font-mono text-foreground/70">
                        {step.detail}
                      </span>
                    ) : null}
                  </div>

                  {/*
                    The pages it actually read, as links the owner can open.
                    This is the useful half of the provider's citation markers:
                    the markers themselves are unrenderable control characters
                    and get stripped, but what they point AT is exactly what
                    someone deciding whether to trust this wants to check.
                  */}
                  {step.sources.length > 0 ? (
                    <div className="flex flex-wrap gap-1.5 pl-5">
                      {step.sources.map((source) => (
                        <a
                          key={source.url}
                          href={source.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex max-w-[22ch] items-center gap-1 rounded-md border px-1.5 py-0.5 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
                        >
                          <ExternalLink className="size-2.5 shrink-0" />
                          <span className="truncate">{source.title}</span>
                        </a>
                      ))}
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          </CollapsibleContent>
        </Collapsible>
      )
    }

    case "proposal":
      return <ProposalCard proposal={entry.proposal} dict={dict} onAccept={onAccept} />
  }
}

function ProposalCard({
  proposal,
  dict,
  onAccept,
}: {
  proposal: AgentProposal
  dict: Dict
  onAccept: (proposal: AgentProposal) => void
}) {
  const audienceLabel =
    proposal.audience === "customers"
      ? dict.builder.audienceCustomers
      : proposal.audience === "businesses"
        ? dict.builder.audienceBusinesses
        : proposal.audience === "staff"
          ? dict.builder.audienceStaff
          : proposal.audience === "mixed"
            ? dict.builder.audienceMixed
            : null

  return (
    <Card>
      <CardContent className="flex flex-col gap-3">
        <div className="flex flex-col gap-1">
          <span className="text-xs text-muted-foreground">
            {dict.builder.proposalTitle}
          </span>
          {proposal.businessName ? (
            <span className="text-base font-medium">{proposal.businessName}</span>
          ) : null}
          <p className="text-sm text-pretty">{proposal.rationale}</p>
        </div>

        {audienceLabel ? (
          <Detail label={dict.builder.serves}>
            <Badge variant="outline" className="font-normal">
              {audienceLabel}
            </Badge>
          </Detail>
        ) : null}

        {proposal.handles?.length ? (
          <Detail label={dict.builder.handles}>
            {proposal.handles.map((item) => (
              <Badge key={item} variant="outline" className="font-normal">
                {item}
              </Badge>
            ))}
          </Detail>
        ) : null}

        {/*
          Shown even though it is the least flattering part of the proposal.
          What an agent refuses to do alone is the thing a merchant most needs
          to agree with before it talks to a customer.
        */}
        {proposal.mustNotDo?.length ? (
          <Detail label={dict.builder.avoids}>
            {proposal.mustNotDo.map((item) => (
              <Badge key={item} variant="secondary" className="font-normal">
                {item}
              </Badge>
            ))}
          </Detail>
        ) : null}

        {proposal.needsLookups?.length ? (
          <Detail label={dict.builder.lookups}>
            {proposal.needsLookups.map((item) => (
              <Badge key={item} variant="outline" className="font-normal">
                {item}
              </Badge>
            ))}
          </Detail>
        ) : null}

        {proposal.needsIntegrationHelp ? (
          <div className="flex flex-col gap-2 rounded-md border border-dashed p-3">
            <span className="text-sm font-medium">
              {dict.builder.integrationNeeded}
            </span>
            <p className="text-sm text-pretty text-muted-foreground">
              {proposal.integrationNotes ?? dict.builder.integrationHint}
            </p>
            <Button size="sm" variant="outline" className="self-start">
              {dict.builder.contactUs}
            </Button>
          </div>
        ) : null}

        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" onClick={() => onAccept(proposal)}>
            <Sparkles />
            {dict.builder.create}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

function Detail({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-xs text-muted-foreground">{label}</span>
      <div className="flex flex-wrap gap-1.5">{children}</div>
    </div>
  )
}
