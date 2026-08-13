"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { ArrowUp, WandSparkles } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupTextarea,
} from "@/components/ui/input-group"
import type { Dict, Locale } from "@/lib/i18n"

export type DescribeExample = {
  slug: string
  label: string
  prompt: string
}

/**
 * The door into the builder — a launcher, not the conversation itself.
 *
 * This used to run the whole interview inline, showing only the model's latest
 * sentence in a card under the template grid. That stopped fitting the moment
 * the interview grew teeth: it now researches the business and asks two to
 * four branching questions, and none of that is legible in one line squeezed
 * above a catalogue.
 *
 * So the typing happens here and the session happens on /build. The owner's
 * sentence rides across in the query string and is sent for them, which means
 * pressing Enter here and landing mid-conversation there feels like one
 * action rather than two screens.
 */
export function TemplateDescribe({
  dict,
  locale,
  examples,
}: {
  dict: Dict
  locale: Locale
  examples: DescribeExample[]
}) {
  const router = useRouter()
  const [value, setValue] = React.useState("")
  const [leaving, setLeaving] = React.useState(false)
  const trimmed = value.trim()

  function open(prompt: string) {
    const text = prompt.trim()
    if (!text || leaving) return
    // Held until the route change commits. Without it a slow navigation looks
    // like a dead button and gets pressed again, starting a second interview.
    setLeaving(true)
    router.push(`/${locale}/build?q=${encodeURIComponent(text)}`)
  }

  return (
    <section className="flex max-w-3xl flex-col gap-3">
      <div className="flex flex-col gap-1">
        <h2 className="flex items-center gap-2 text-base font-medium">
          <WandSparkles className="size-4 text-muted-foreground" />
          {dict.templates.describeDoor}
        </h2>
        <p className="text-sm text-pretty text-muted-foreground">
          {dict.templates.describeDoorHint}
        </p>
      </div>

      <form
        onSubmit={(event) => {
          event.preventDefault()
          open(value)
        }}
      >
        <InputGroup>
          <InputGroupTextarea
            value={value}
            onChange={(event) => setValue(event.target.value)}
            onKeyDown={(event) => {
              // Enter opens, Shift+Enter breaks the line. IME composition must
              // never be interrupted.
              if (
                event.key !== "Enter" ||
                event.shiftKey ||
                event.nativeEvent.isComposing
              ) {
                return
              }
              event.preventDefault()
              event.currentTarget.form?.requestSubmit()
            }}
            placeholder={dict.templates.describePlaceholder}
            aria-label={dict.templates.describeDoor}
            rows={3}
            disabled={leaving}
          />
          <InputGroupAddon align="block-end" className="border-t">
            <InputGroupButton
              type="submit"
              size="sm"
              variant="default"
              disabled={!trimmed || leaving}
              className="ml-auto"
            >
              {dict.common.submit}
              <ArrowUp />
            </InputGroupButton>
          </InputGroupAddon>
        </InputGroup>
      </form>

      <div className="flex flex-wrap gap-1.5">
        {examples.map((example) => (
          <Button
            key={example.slug}
            size="sm"
            variant="outline"
            className="font-normal"
            disabled={leaving}
            onClick={() => open(example.prompt)}
          >
            {example.label}
          </Button>
        ))}
      </div>
    </section>
  )
}
