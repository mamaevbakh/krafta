"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { CircleDashed, Plug } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Item,
  ItemActions,
  ItemContent,
  ItemGroup,
  ItemMedia,
  ItemTitle,
} from "@/components/ui/item"
import { Progress } from "@/components/ui/progress"
import {
  Questionnaire,
  QuestionnaireActions,
  QuestionnaireChoice,
  QuestionnaireChoiceDescription,
  QuestionnaireChoices,
  QuestionnaireDescription,
  QuestionnaireError,
  QuestionnaireInput,
  QuestionnaireItem,
  QuestionnaireNext,
  QuestionnairePrevious,
  QuestionnaireProgress,
  QuestionnaireSkip,
  QuestionnaireSubmit,
  QuestionnaireTitle,
} from "@/components/ui/questionnaire"
import { toast } from "sonner"

import { createAgentFromSetup } from "@/lib/actions/agents"
import { clearProposalDraft, readProposalDraft } from "@/lib/preview/proposal"
import { LOCALES, LOCALE_LABELS, fill, getDict, type Locale } from "@/lib/i18n"
import type { Template } from "@/lib/mock/data"

/**
 * The wizard's question copy lives here, not in `lib/i18n`, for one reason:
 * these strings are the setup screen's own script and nothing else renders
 * them. The shared catalogue carries the words the whole console reuses
 * (buttons, section titles, the step counter) and this file reaches for those
 * — `dict.common.next`, `dict.setup.finish`, `dict.templates.required` — every
 * time one exists.
 *
 * Same discipline as the catalogue itself: all three locales or none. Uzbek is
 * the source of truth and RU/EN are typed against it, so a forgotten
 * translation is a type error rather than an English sentence leaking into an
 * Uzbek screen.
 */
const uz = {
  business: {
    title: "Biznesingiz nomi nima?",
    description: "Agent mijoz bilan shu nom ostida gaplashadi.",
    placeholder: "Navvat Coffee",
  },
  hours: {
    title: "Qachon ishlaysiz?",
    description:
      "Ish vaqtidan tashqarida agent shuni aytadi va ortiqcha va'da bermaydi.",
    weekdays: "09:00–18:00 · dushanba–shanba",
    daily: "10:00–22:00 · har kuni",
    always: "24/7",
    alwaysHint: "Tanaffussiz",
  },
  languages: {
    title: "Agent qaysi tilda javob bersin?",
    description:
      "Bir nechtasini tanlang — mijoz qaysi tilda yozsa, javob ham shu tilda bo'ladi.",
  },
  escalation: {
    title: "Pul qaytarish va shikoyatlarni kim hal qiladi?",
    description: "Agent bunday savolni o'zi hal qilmaydi — shu odamga uzatadi.",
    placeholder: "Dilnoza",
  },
  tone: {
    title: "Agent qanday ohangda gapirsin?",
    description: "Buni keyin ham o'zgartirasiz.",
    warm: "Samimiy va hurmat bilan",
    warmHint: "«Assalomu alaykum! Sizga qanday yordam beray?»",
    brief: "Qisqa va aniq",
    briefHint: "«Ish vaqti: 09:00–18:00.»",
  },
  channel: {
    title: "Agent qayerda javob beradi?",
    description: "Keyinroq yana bitta kanal qo'shishingiz mumkin.",
    web: "Saytdagi chat",
    webHint: "Krafta do'koningizga o'rnatiladi",
    telegram: "Telegram",
    telegramHint: "Mijozlaringiz allaqachon shu yerda",
  },
  integrations: {
    description:
      "Bularsiz ham agent ishlaydi — faqat shu savollarga javob bera olmaydi.",
    connect: "Ulash",
    pending: "Ulanmagan",
    fallback: "Ulanmaguncha agent nima qilsin?",
    escalate: "Savolni odamga uzatsin",
    admit: "Bilmasligini ochiq aytsin",
  },
  errorChoose: "Davom etish uchun javobni tanlang.",
  errorFill: "Davom etish uchun to'ldiring.",
}

/** Shape is the contract, strings are not — same reason `Dict` isn't `as const`. */
type WizardCopy = typeof uz

const ru: WizardCopy = {
  business: {
    title: "Как называется ваш бизнес?",
    description: "Под этим именем агент разговаривает с клиентом.",
    placeholder: "Navvat Coffee",
  },
  hours: {
    title: "Когда вы работаете?",
    description:
      "Вне этих часов агент так и скажет и не станет ничего обещать.",
    weekdays: "09:00–18:00 · пн–сб",
    daily: "10:00–22:00 · ежедневно",
    always: "24/7",
    alwaysHint: "Без перерыва",
  },
  languages: {
    title: "На каком языке агенту отвечать?",
    description:
      "Выберите несколько — агент ответит на том языке, на котором ему написали.",
  },
  escalation: {
    title: "Кто решает возвраты и жалобы?",
    description: "Такое агент не решает сам — передаёт этому человеку.",
    placeholder: "Дильноза",
  },
  tone: {
    title: "Каким тоном агенту говорить?",
    description: "Это можно изменить позже.",
    warm: "Тепло и на «вы»",
    warmHint: "«Здравствуйте! Чем могу помочь?»",
    brief: "Коротко и по делу",
    briefHint: "«Часы работы: 09:00–18:00.»",
  },
  channel: {
    title: "Где агент отвечает?",
    description: "Позже можно добавить ещё один канал.",
    web: "Чат на сайте",
    webHint: "Встраивается в ваш магазин Krafta",
    telegram: "Telegram",
    telegramHint: "Ваши клиенты уже там",
  },
  integrations: {
    description: "Без них агент работает — просто не ответит на эти вопросы.",
    connect: "Подключить",
    pending: "Не подключено",
    fallback: "Что делать агенту, пока не подключено?",
    escalate: "Передать вопрос человеку",
    admit: "Честно сказать, что не знает",
  },
  errorChoose: "Выберите ответ, чтобы продолжить.",
  errorFill: "Заполните поле, чтобы продолжить.",
}

const en: WizardCopy = {
  business: {
    title: "What is your business called?",
    description: "This is the name the agent uses with your customers.",
    placeholder: "Navvat Coffee",
  },
  hours: {
    title: "When are you open?",
    description:
      "Outside these hours the agent says so instead of promising anything.",
    weekdays: "09:00–18:00 · Mon–Sat",
    daily: "10:00–22:00 · every day",
    always: "24/7",
    alwaysHint: "Never closes",
  },
  languages: {
    title: "Which language should the agent answer in?",
    description:
      "Pick more than one — the agent replies in whatever language it was written in.",
  },
  escalation: {
    title: "Who handles refunds and complaints?",
    description: "The agent never settles these itself — it hands them over.",
    placeholder: "Dilnoza",
  },
  tone: {
    title: "How should the agent sound?",
    description: "You can change this later.",
    warm: "Warm and formal",
    warmHint: "“Hello! How can I help you today?”",
    brief: "Short and efficient",
    briefHint: "“Open 09:00–18:00.”",
  },
  channel: {
    title: "Where does the agent answer?",
    description: "You can add another channel later.",
    web: "Chat on your website",
    webHint: "Embedded in your Krafta shop",
    telegram: "Telegram",
    telegramHint: "Where your customers already are",
  },
  integrations: {
    description:
      "The agent still runs without these — it just can't answer those questions.",
    connect: "Connect",
    pending: "Not connected",
    fallback: "What should the agent do until then?",
    escalate: "Hand the question to a person",
    admit: "Say plainly that it doesn't know",
  },
  errorChoose: "Choose an answer to continue.",
  errorFill: "Fill this in to continue.",
}

const COPY: Record<Locale, WizardCopy> = { uz, ru, en }

/**
 * Finishing setup creates a real DRAFT agent and drops the owner on its
 * verification run — the screen that decides whether this thing may face a
 * customer. Draft, never live: publishing is a separate, gated act, and the
 * schema refuses a live agent without a compiled prompt anyway.
 */
type WizardChoice = {
  value: string
  label: string
  description?: string
}

type WizardStep = {
  name: string
  title: string
  description?: string
  /** Required steps block Next; optional ones surface the Skip action. */
  required: boolean
  multiple?: boolean
  placeholder?: string
  choices?: WizardChoice[]
  /** Extra content between the question and its answers (the connect rows). */
  prelude?: React.ReactNode
  /** A second heading when the step carries content above its choices. */
  choicesLabel?: string
  error: string
}

export function SetupWizard({
  locale,
  template,
}: {
  locale: Locale
  template: Template
}) {
  const router = useRouter()
  const dict = getDict(locale)
  const copy = COPY[locale]

  const steps = React.useMemo<WizardStep[]>(() => {
    const list: WizardStep[] = [
      {
        name: "business",
        title: copy.business.title,
        description: copy.business.description,
        placeholder: copy.business.placeholder,
        required: true,
        error: copy.errorFill,
      },
      {
        name: "hours",
        title: copy.hours.title,
        description: copy.hours.description,
        required: true,
        choices: [
          { value: "weekdays", label: copy.hours.weekdays },
          { value: "daily", label: copy.hours.daily },
          {
            value: "always",
            label: copy.hours.always,
            description: copy.hours.alwaysHint,
          },
        ],
        error: copy.errorChoose,
      },
      {
        name: "languages",
        title: copy.languages.title,
        description: copy.languages.description,
        required: true,
        multiple: true,
        // The locale labels are already written in their own language — the
        // one list in this product that must not be translated.
        choices: LOCALES.map((code) => ({
          value: code,
          label: LOCALE_LABELS[code],
        })),
        error: copy.errorChoose,
      },
      {
        name: "escalation",
        title: copy.escalation.title,
        description: copy.escalation.description,
        placeholder: copy.escalation.placeholder,
        required: true,
        error: copy.errorFill,
      },
      {
        name: "tone",
        title: copy.tone.title,
        description: copy.tone.description,
        // The one answer with a sane default: skipping it is a real option,
        // which is what puts the Skip action on screen at all.
        required: false,
        choices: [
          {
            value: "warm",
            label: copy.tone.warm,
            description: copy.tone.warmHint,
          },
          {
            value: "brief",
            label: copy.tone.brief,
            description: copy.tone.briefHint,
          },
        ],
        error: copy.errorChoose,
      },
      {
        name: "channel",
        title: copy.channel.title,
        description: copy.channel.description,
        required: true,
        choices: [
          {
            value: "web",
            label: copy.channel.web,
            description: copy.channel.webHint,
          },
          {
            value: "telegram",
            label: copy.channel.telegram,
            description: copy.channel.telegramHint,
          },
        ],
        error: copy.errorChoose,
      },
    ]

    if (template.requiredIntegrations.length > 0) {
      list.push({
        name: "integrations",
        title: dict.templates.required,
        description: copy.integrations.description,
        required: true,
        prelude: (
          <ItemGroup className="gap-2">
            {template.requiredIntegrations.map((integration) => (
              <Item key={integration} variant="outline" size="sm">
                <ItemMedia variant="icon">
                  <Plug className="text-muted-foreground" />
                </ItemMedia>
                <ItemContent>
                  <ItemTitle>
                    {integration}
                    <Badge
                      variant="outline"
                      className="gap-1 font-normal text-muted-foreground"
                    >
                      <CircleDashed />
                      {copy.integrations.pending}
                    </Badge>
                  </ItemTitle>
                </ItemContent>
                <ItemActions>
                  {/*
                    Deliberately inert: there is no OAuth handshake behind this
                    console yet. The row states what is missing rather than
                    pretending the connection is one click away.
                  */}
                  <Button type="button" variant="outline" size="sm">
                    {copy.integrations.connect}
                  </Button>
                </ItemActions>
              </Item>
            ))}
          </ItemGroup>
        ),
        // Connecting can wait; deciding what the agent says in the meantime
        // cannot — that answer is the difference between an honest agent and
        // one that invents stock levels.
        choicesLabel: copy.integrations.fallback,
        choices: [
          { value: "escalate", label: copy.integrations.escalate },
          { value: "admit", label: copy.integrations.admit },
        ],
        error: copy.errorChoose,
      })
    }

    return list
  }, [copy, dict, template])

  /**
   * Root is told which item is active rather than tracking it itself, so the
   * step counter can be written in the owner's language instead of the
   * primitive's built-in "Question 1 of 7".
   */
  const [activeItem, setActiveItem] = React.useState(steps[0].name)

  const items = React.useMemo(
    () =>
      steps.map((step) => ({
        name: step.name,
        required: step.required,
        choices: step.choices?.map((choice) => ({ value: choice.value })),
      })),
    [steps]
  )

  const index = Math.max(
    0,
    steps.findIndex((step) => step.name === activeItem)
  )
  const current = index + 1
  const total = steps.length

  const [pending, startTransition] = React.useTransition()
  const formRef = React.useRef<HTMLFormElement>(null)
  const draftKey = `krafta-ai:setup:${template.slug}`

  function clearDraft() {
    try {
      window.localStorage.removeItem(draftKey)
    } catch {
      // Private mode / storage disabled. Losing a draft is survivable;
      // throwing here during a successful create is not.
    }
  }

  /**
   * Setup is seven questions a shop owner answers on a phone between
   * customers. A reload that wipes them is the difference between finishing
   * and giving up, so every keystroke is snapshotted and replayed on mount.
   *
   * Replay writes through the DOM and dispatches the events React listens
   * for: the questionnaire primitive owns its own inputs, so assigning
   * `.value` alone would update the pixels and leave its state stale.
   */
  /**
   * Setup is seven questions a shop owner answers on a phone between
   * customers. A reload that wipes them is the difference between finishing
   * and giving up.
   *
   * Restore goes through the primitive's own `defaultValue` / `defaultChecked`
   * rather than writing to the DOM: these inputs are React-controlled, so an
   * imperative `el.checked = true` is erased by the next render. The draft
   * therefore arrives as state and the form is remounted (via `key`) once it
   * has loaded — one extra render, and no hydration mismatch from reading
   * localStorage during SSR.
   */
  const [draft, setDraft] = React.useState<Record<string, string[]> | null>(null)

  React.useEffect(() => {
    // set-state-in-effect is disabled deliberately. localStorage does not
    // exist during SSR, so reading it in a lazy useState initialiser would
    // make the client's first render disagree with the server's and corrupt
    // hydration. Loading after mount is the correct shape here; the extra
    // render is the price of not having a hydration mismatch.
    try {
      const saved = window.localStorage.getItem(draftKey)
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setDraft(saved ? (JSON.parse(saved) as Record<string, string[]>) : {})
    } catch {
      // Corrupt or unavailable storage must not break setup.
      setDraft({})
    }
  }, [draftKey])

  React.useEffect(() => {
    const form = formRef.current
    if (!form || draft === null) return

    function snapshot() {
      if (!formRef.current) return
      const data = new FormData(formRef.current)
      const out: Record<string, string[]> = {}
      for (const key of new Set(data.keys())) {
        out[key] = data.getAll(key).map((v) => String(v))
      }
      try {
        window.localStorage.setItem(draftKey, JSON.stringify(out))
      } catch {
        // Quota or private mode — proceed without persistence.
      }
    }

    form.addEventListener("input", snapshot)
    form.addEventListener("change", snapshot)
    return () => {
      form.removeEventListener("input", snapshot)
      form.removeEventListener("change", snapshot)
    }
  }, [draftKey, draft])


  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)

    // Multi-select steps repeat their key, so collect every value rather than
    // taking the first — otherwise a merchant who picks Uzbek AND Russian
    // silently gets an Uzbek-only agent.
    const answers: Record<string, string | string[]> = {}
    for (const key of new Set(form.keys())) {
      const all = form.getAll(key).map((v) => String(v))
      answers[key] = all.length > 1 ? all : (all[0] ?? "")
    }

    // `hours` and `tone` are prose destined for the agent's prompt, but a
    // choice submits its VALUE — so the agent would be told "Working hours:
    // weekdays" instead of "09:00–18:00 · Mon–Sat". Swap in the label the
    // merchant actually read. Language and channel keep their values: those
    // are enums the database stores, not sentences.
    for (const name of ["hours", "tone"] as const) {
      const chosen = answers[name]
      if (typeof chosen !== "string" || !chosen) continue
      const label = steps
        .find((s) => s.name === name)
        ?.choices?.find((c) => c.value === chosen)?.label
      if (label) answers[name] = label
    }

    // What the interview established, if they arrived through the builder
    // rather than the template grid. The form cannot carry it — there is no
    // field for "this must never approve a refund itself" — so it travels
    // alongside and the server decides what of it is keepable.
    const interview = readProposalDraft(template.slug) ?? undefined

    startTransition(async () => {
      const result = await createAgentFromSetup(template.slug, answers, interview)
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      // Both drafts are only cleared once the row exists. Clearing on submit
      // would lose a half-hour of a merchant's answers to a network blip.
      clearDraft()
      clearProposalDraft(template.slug)
      router.push(`/${locale}/agents/${result.agentId}/verification`)
    })
  }

  return (
    <Questionnaire
      key={draft === null ? "loading" : "ready"}
      ref={formRef}
      items={items}
      item={activeItem}
      onItemChange={setActiveItem}
      shortcuts="numbers"
      onSubmit={handleSubmit}
      className="gap-5"
    >
      {/*
        The counter reads the step out of Root's own context, so it has to live
        inside the form — it is not a header decoration that can sit above it.
      */}
      <div className="flex items-center gap-3">
        <QuestionnaireProgress
          // Left alone, the primitive announces its own English
          // "Question 1 of 7" to a screen reader — the one place a hardcoded
          // language could still reach an Uzbek merchant.
          aria-label={dict.setup.title}
          aria-valuetext={fill(dict.setup.stepOf, { current, total })}
          className="shrink-0 font-mono"
        >
          {fill(dict.setup.stepOf, { current, total })}
        </QuestionnaireProgress>
        {/*
          The rail repeats what the counter already announces, so it is hidden
          from screen readers instead of being read out twice.
        */}
        <div aria-hidden className="min-w-0 flex-1">
          <Progress value={(current / total) * 100} />
        </div>
      </div>

      {steps.map((step) => (
        <QuestionnaireItem
          key={step.name}
          name={step.name}
          required={step.required}
          multiple={step.multiple}
        >
          <QuestionnaireTitle>
            {step.title}
            {step.required ? null : (
              <Badge
                variant="outline"
                className="ml-2 align-middle font-normal text-muted-foreground"
              >
                {dict.common.optional}
              </Badge>
            )}
          </QuestionnaireTitle>
          {step.description ? (
            <QuestionnaireDescription>
              {step.description}
            </QuestionnaireDescription>
          ) : null}

          {step.prelude}

          {step.choices ? (
            <div className="flex flex-col gap-2">
              {step.choicesLabel ? (
                <p className="text-sm font-medium">{step.choicesLabel}</p>
              ) : null}
              <QuestionnaireChoices>
                {step.choices.map((choice) => (
                  <QuestionnaireChoice
                    key={choice.value}
                    value={choice.value}
                    defaultChecked={draft?.[step.name]?.includes(choice.value)}
                  >
                    {choice.label}
                    {choice.description ? (
                      <QuestionnaireChoiceDescription>
                        {choice.description}
                      </QuestionnaireChoiceDescription>
                    ) : null}
                  </QuestionnaireChoice>
                ))}
              </QuestionnaireChoices>
            </div>
          ) : (
            <QuestionnaireInput
              aria-label={step.title}
              autoComplete="off"
              placeholder={step.placeholder}
              defaultValue={draft?.[step.name]?.[0] ?? ""}
            />
          )}

          <QuestionnaireError>{step.error}</QuestionnaireError>
        </QuestionnaireItem>
      ))}

      <QuestionnaireActions>
        <QuestionnairePrevious>{dict.common.back}</QuestionnairePrevious>
        <QuestionnaireSkip>{dict.common.skip}</QuestionnaireSkip>
        <QuestionnaireNext>{dict.common.next}</QuestionnaireNext>
        <QuestionnaireSubmit disabled={pending}>
          {dict.setup.finish}
        </QuestionnaireSubmit>
      </QuestionnaireActions>
    </Questionnaire>
  )
}
