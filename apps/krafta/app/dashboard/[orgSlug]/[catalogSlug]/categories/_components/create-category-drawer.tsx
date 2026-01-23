"use client"

import { XIcon } from "lucide-react"
import { useEffect, useMemo, useState, useTransition } from "react"
import { useRouter } from "next/navigation"

import {
  Conversation,
  ConversationContent,
  ConversationEmptyState,
} from "@/components/ai-elements/conversation"
import {
  PromptInput,
  PromptInputBody,
  PromptInputFooter,
  PromptInputSubmit,
  PromptInputTextarea,
  PromptInputTools,
} from "@/components/ai-elements/prompt-input"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSeparator,
  FieldSet,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from "@/components/ui/drawer"
import type { CatalogCategory } from "@/lib/catalogs/types"
import { createCategory, updateCategory } from "./actions"

type LocaleOption = {
  id: string
  locale: string
  is_default: boolean
  is_enabled: boolean
  sort_order: number
}

type CreateCategoryDrawerProps = {
  catalogId: string
  catalogSlug: string
  locales: LocaleOption[]
  open: boolean
  onOpenChange: (open: boolean) => void
  mode?: "create" | "edit"
  category?: CatalogCategory
  initialTranslations?: {
    id: string
    category_id: string
    locale: string
    name: string
    description: string | null
  }[]
  existingSlugs?: string[]
}

type TranslationState = {
  name: string
  description: string
}

export function CreateCategoryDrawer({
  catalogId,
  catalogSlug,
  locales,
  open,
  onOpenChange,
  mode = "create",
  category,
  initialTranslations = [],
  existingSlugs = [],
}: CreateCategoryDrawerProps) {
  const router = useRouter()
  const [aiOpen, setAiOpen] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const [slugValue, setSlugValue] = useState("")
  const [slugTouched, setSlugTouched] = useState(false)
  const [slugError, setSlugError] = useState<string | null>(null)

  const enabledLocales = useMemo(
    () =>
      locales
        .filter((locale) => locale.is_enabled)
        .sort((a, b) => a.sort_order - b.sort_order),
    [locales],
  )

  const defaultLocale =
    enabledLocales.find((locale) => locale.is_default)?.locale ??
    enabledLocales[0]?.locale ??
    "en"

  const [translations, setTranslations] = useState<
    Record<string, TranslationState>
  >({})

  useEffect(() => {
    if (!open) return
    const nextTranslations: Record<string, TranslationState> = {}
    enabledLocales.forEach((locale) => {
      const existing = initialTranslations.find(
        (translation) => translation.locale === locale.locale,
      )
      nextTranslations[locale.locale] = {
        name: existing?.name ?? "",
        description: existing?.description ?? "",
      }
    })
    setTranslations(nextTranslations)
    setSlugTouched(false)
    setSlugValue(category?.slug ?? "")
    setSlugError(null)
    setErrorMessage(null)
  }, [category?.slug, enabledLocales, initialTranslations, open])

  function updateTranslation(
    locale: string,
    field: keyof TranslationState,
    value: string,
  ) {
    setTranslations((prev) => ({
      ...prev,
      [locale]: {
        ...prev[locale],
        [field]: value,
      },
    }))
  }

  const defaultName = translations[defaultLocale]?.name ?? ""
  const isEdit = mode === "edit" && !!category
  const slugPreview = slugValue.trim()

  function slugify(value: string): string {
    return value
      .toLowerCase()
      .trim()
      .replace(/['"]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
  }

  useEffect(() => {
    if (!open) return
    if (slugTouched) return
    const nextSlug = slugify(defaultName)
    setSlugValue(nextSlug)
  }, [defaultName, open, slugTouched])

  useEffect(() => {
    if (!slugValue) {
      setSlugError("Category slug could not be generated.")
      return
    }
    const normalized = slugValue.trim().toLowerCase()
    const isDuplicate = existingSlugs.some(
      (slug) =>
        slug.toLowerCase() === normalized &&
        slug.toLowerCase() !== (category?.slug ?? "").toLowerCase(),
    )
    setSlugError(isDuplicate ? "This slug is already used in this catalog." : null)
  }, [category?.slug, existingSlugs, slugValue])

  return (
    <Drawer
      direction="right"
      open={open}
      onOpenChange={onOpenChange}
    >
      <DrawerContent
        className={cn(
          "flex h-full flex-col px-0 data-[vaul-drawer-direction=right]:!max-w-none",
          aiOpen
            ? "data-[vaul-drawer-direction=right]:!w-screen md:data-[vaul-drawer-direction=right]:!w-[65vw]"
            : "data-[vaul-drawer-direction=right]:!w-screen md:data-[vaul-drawer-direction=right]:!w-[35vw]"
        )}
      >
        <DrawerHeader className="border-b px-6 py-4">
          <div className="flex items-center justify-between gap-4">
            <div>
              <DrawerTitle className="text-lg">
                {isEdit ? "Edit category" : "Create category"}
              </DrawerTitle>
            </div>
            <div className="flex items-center gap-2">
              <Button size="sm" variant="outline" onClick={() => setAiOpen((open) => !open)}>
                {aiOpen ? "Close assistant" : "Krafta AI"}
              </Button>
              <DrawerClose asChild>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Close drawer"
                >
                  <XIcon className="size-4" />
                </Button>
              </DrawerClose>
            </div>
          </div>
        </DrawerHeader>
        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto lg:flex-row">
          <div className="flex-1 px-6 py-6">
            <form
              id="create-category-form"
              className="space-y-6"
              onSubmit={(event) => {
                event.preventDefault()
                setErrorMessage(null)

                startTransition(async () => {
                  const payload = enabledLocales.map((locale) => ({
                    locale: locale.locale,
                    name: translations[locale.locale]?.name ?? "",
                    description: translations[locale.locale]?.description ?? "",
                  }))

                  if (slugError) {
                    setErrorMessage(slugError)
                    return
                  }

                  const result = isEdit
                    ? await updateCategory({
                        catalogId,
                        catalogSlug,
                        categoryId: category.id,
                        name: defaultName,
                        slug: slugValue,
                        translations: payload,
                      })
                    : await createCategory({
                        catalogId,
                        catalogSlug,
                        name: defaultName,
                        slug: slugValue,
                        translations: payload,
                      })

                  if (!result.ok) {
                    setErrorMessage(result.error ?? "Unable to create category.")
                    return
                  }

                  onOpenChange(false)
                  router.refresh()
                })
              }}
            >
              <FieldGroup>
                <FieldSet>
                  <FieldLegend>Category details</FieldLegend>
                  <FieldDescription>
                    Add translations for the locales in this catalog.
                  </FieldDescription>
                  <FieldGroup className="@container/field-group flex flex-col gap-5">
                    {enabledLocales.map((locale, index) => (
                      <FieldSet key={locale.id} className="space-y-4 rounded-lg border p-4">
                        <FieldLegend variant="label" className="flex items-center justify-between">
                          <span>{locale.locale.toUpperCase()}</span>
                        </FieldLegend>
                        <FieldGroup className="gap-4">
                          <Field>
                            <FieldLabel htmlFor={`category-name-${locale.id}`}>
                              Name
                            </FieldLabel>
                            <Input
                              id={`category-name-${locale.id}`}
                              placeholder="Category name"
                              value={translations[locale.locale]?.name ?? ""}
                              onChange={(event) => {
                                updateTranslation(
                                  locale.locale,
                                  "name",
                                  event.target.value,
                                )
                              }}
                              required={locale.locale === defaultLocale}
                            />
                            {locale.locale === defaultLocale && (
                              <FieldDescription>
                                This name is used as the main catalog label.
                              </FieldDescription>
                            )}
                          </Field>
                          {locale.locale === defaultLocale && (
                            <Field data-invalid={!!slugError}>
                              <FieldLabel htmlFor={`category-slug-${locale.id}`}>
                                Slug
                              </FieldLabel>
                              <Input
                                id={`category-slug-${locale.id}`}
                                placeholder="category-slug"
                                value={slugValue}
                                onChange={(event) => {
                                  setSlugTouched(true)
                                  setSlugValue(slugify(event.target.value))
                                }}
                              />
                              <FieldDescription className="text-xs">
                                krafta.uz/{catalogSlug}/{slugPreview || "category-slug"}
                              </FieldDescription>
                              {slugError ? <FieldError>{slugError}</FieldError> : null}
                            </Field>
                          )}
                          <Field>
                            <FieldLabel htmlFor={`category-description-${locale.id}`}>
                              Description
                            </FieldLabel>
                            <Textarea
                              id={`category-description-${locale.id}`}
                              placeholder="Optional description"
                              value={translations[locale.locale]?.description ?? ""}
                              onChange={(event) =>
                                updateTranslation(
                                  locale.locale,
                                  "description",
                                  event.target.value,
                                )
                              }
                              className="min-h-[88px] resize-none"
                            />
                          </Field>
                        </FieldGroup>
                        {index < enabledLocales.length - 1 && (
                          <FieldSeparator />
                        )}
                      </FieldSet>
                    ))}
                  </FieldGroup>
                </FieldSet>

                {errorMessage ? (
                  <Field data-invalid>
                    <FieldError>{errorMessage}</FieldError>
                  </Field>
                ) : null}
              </FieldGroup>
            </form>
          </div>
          {aiOpen ? (
            
              <div className="flex h-full flex-col border-l">
                <div className="border-b px-4 py-3 text-sm font-medium">
                  Krafta AI
                </div>
                <Conversation className="flex-1">
                  <ConversationContent>
                    <ConversationEmptyState
                      title="Start with a prompt"
                      description="Describe the category and Krafta AI will help."
                    />
                  </ConversationContent>
                </Conversation>
                <div className="border-t bg-background/70 p-3">
                  <PromptInput
                    className="w-full"
                    onSubmit={(message, event) => {
                      event.preventDefault()
                      event.currentTarget.reset()
                    }}
                  >
                    <PromptInputBody>
                      <PromptInputTextarea />
                      <PromptInputFooter>
                        <PromptInputTools>
                        </PromptInputTools>
                        <PromptInputSubmit />
                      </PromptInputFooter>
                    </PromptInputBody>
                  </PromptInput>
                </div>
              </div>
            
          ) : null}
        </div>
        <DrawerFooter className="border-t px-6 py-4">
          <div className="flex w-full gap-3 lg:justify-end">
            <DrawerClose asChild>
              <Button
                variant="outline"
                size="lg"
                className="flex-1 lg:flex-none"
                disabled={isPending}
              >
                Cancel
              </Button>
            </DrawerClose>
            <Button
              size="lg"
              className="flex-1 lg:flex-none"
              type="submit"
              form="create-category-form"
              disabled={isPending}
            >
              {isEdit ? "Save changes" : "Create category"}
            </Button>
          </div>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  )
}
