"use client"

import * as React from "react"
import { Plus } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import {
  Card,
  CardAction,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Field, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { NativeSelect } from "@/components/ui/native-select"
import { Spinner } from "@/components/ui/spinner"
import { Textarea } from "@/components/ui/textarea"
import { addKnowledge } from "@/lib/actions/knowledge"
import type { Dict } from "@/lib/i18n"

/**
 * Paste-a-document is the whole ingestion path for now. File upload lands with
 * PDF/DOCX parsing (B2a) — deliberately not faked here, because a file picker
 * that silently does nothing is worse than no file picker.
 */
export function AddKnowledgeForm({ dict }: { dict: Dict }) {
  const [open, setOpen] = React.useState(false)
  const [pending, startTransition] = React.useTransition()
  const formRef = React.useRef<HTMLFormElement>(null)

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    startTransition(async () => {
      const result = await addKnowledge(null, data)
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      toast.success(
        result.unchanged
          ? dict.knowledge.unchanged
          : `${dict.knowledge.added} — ${result.chunkCount} ${dict.knowledge.chunks}`
      )
      formRef.current?.reset()
      setOpen(false)
    })
  }

  if (!open) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">{dict.knowledge.title}</CardTitle>
          <CardAction>
            <Button size="sm" onClick={() => setOpen(true)}>
              <Plus />
              {dict.knowledge.add}
            </Button>
          </CardAction>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          {dict.knowledge.subtitle}
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardContent>
        <form ref={formRef} onSubmit={onSubmit} className="flex flex-col gap-4">
          <Field>
            <FieldLabel htmlFor="k-title">{dict.knowledge.addTitle}</FieldLabel>
            <Input
              id="k-title"
              name="title"
              required
              placeholder={dict.knowledge.addTitlePlaceholder}
            />
          </Field>

          <Field>
            <FieldLabel htmlFor="k-lang">{dict.knowledge.language}</FieldLabel>
            <NativeSelect id="k-lang" name="lang" defaultValue="">
              <option value="">—</option>
              <option value="uz-Latn">O&apos;zbekcha (Latin)</option>
              <option value="uz-Cyrl">Ўзбекча (Кирилл)</option>
              <option value="ru">Русский</option>
              <option value="en">English</option>
            </NativeSelect>
          </Field>

          <Field>
            <FieldLabel htmlFor="k-text">{dict.knowledge.addText}</FieldLabel>
            <Textarea
              id="k-text"
              name="text"
              required
              rows={10}
              placeholder={dict.knowledge.addTextPlaceholder}
            />
          </Field>

          <div className="flex items-center gap-2">
            <Button type="submit" disabled={pending}>
              {pending ? <Spinner /> : null}
              {dict.knowledge.save}
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={() => setOpen(false)}
              disabled={pending}
            >
              {dict.common.cancel}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  )
}
