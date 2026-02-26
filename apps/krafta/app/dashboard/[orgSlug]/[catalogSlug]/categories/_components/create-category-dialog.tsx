"use client"

import { XIcon } from "lucide-react"
import { useEffect, useMemo, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import type { CatalogCategory } from "@/lib/catalogs/types"
import { createCategory, updateCategory } from "./actions"

type LocaleOption = {
  id: string
  locale: string
  is_default: boolean
  is_enabled: boolean
  sort_order: number
}

type CreateCategoryDialogProps = {
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

export function CreateCategoryDialog({
  catalogId,
  catalogSlug,
  locales,
  open,
  onOpenChange,
  mode = "create",
  category,
  initialTranslations = [],
  existingSlugs = [],
}: CreateCategoryDialogProps) {
  const router = useRouter()
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
    const normalized = slugValue.trim().toLowerCase()
    const canValidateRequiredSlug =
      slugTouched || defaultName.trim().length > 0 || isEdit

    if (!normalized) {
      setSlugError(
        canValidateRequiredSlug ? "Category slug could not be generated." : null,
      )
      return
    }
    const isDuplicate = existingSlugs.some(
      (slug) =>
        slug.toLowerCase() === normalized &&
        slug.toLowerCase() !== (category?.slug ?? "").toLowerCase(),
    )
    setSlugError(isDuplicate ? "This slug is already used in this catalog." : null)
  }, [category?.slug, defaultName, existingSlugs, isEdit, slugTouched, slugValue])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        aria-describedby={undefined}
        className="!flex !flex-col inset-0 h-[100dvh] w-screen max-w-none translate-x-0 translate-y-0 gap-0 overflow-hidden overscroll-contain rounded-none border-0 p-0 shadow-none sm:max-w-none"
      >
        <DialogTitle className="sr-only">
          {isEdit ? "Edit category" : "Create category"}
        </DialogTitle>
        <div className="flex h-full min-h-0 w-full flex-col bg-background">
          <div className="shrink-0 border-b bg-background/95 px-6 py-4 backdrop-blur md:px-8">
            <div className="mx-auto flex w-full max-w-[1248px] items-center justify-between gap-4">
              <DialogHeader className="gap-1 p-0 text-left">
                <DialogTitle className="text-xl tracking-tight md:text-2xl">
                  {isEdit ? "Edit category" : "Create category"}
                </DialogTitle>
                <DialogDescription>
                  Add translations and metadata for this catalog category.
                </DialogDescription>
              </DialogHeader>
              <Button
                variant="ghost"
                size="icon"
                aria-label="Close modal"
                className="size-10 rounded-full"
                onClick={() => onOpenChange(false)}
              >
                <XIcon className="size-4" />
              </Button>
            </div>
          </div>

          <div className="flex min-h-0 flex-1 overflow-hidden bg-muted/15">
            <div className="min-w-0 flex-1 overflow-y-auto overscroll-contain">
              <div className="mx-auto w-full max-w-[980px] px-6 py-6 md:px-8 md:py-8">
            <form
              id="create-category-form"
              className="space-y-8"
              onSubmit={(event) => {
                event.preventDefault()
                setErrorMessage(null)

                startTransition(async () => {
                  const payload = enabledLocales.map((locale) => ({
                    locale: locale.locale,
                    name: translations[locale.locale]?.name ?? "",
                    description: translations[locale.locale]?.description ?? "",
                  }))

                  if (!slugValue.trim()) {
                    const message = "Category slug could not be generated."
                    setSlugError(message)
                    setErrorMessage(message)
                    return
                  }

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
              <FieldGroup className="gap-6">
                <FieldSet className="rounded-2xl border bg-background p-5 shadow-xs md:p-6">
                  <FieldLegend>Category details</FieldLegend>
                  <FieldDescription>
                    Add translations for the locales in this catalog.
                  </FieldDescription>
                  <FieldGroup className="@container/field-group mt-5 flex flex-col gap-5">
                    {enabledLocales.map((locale, index) => (
                      <FieldSet key={locale.id} className="space-y-4 rounded-lg border p-4">
                        <FieldLegend variant="label" className="flex items-center justify-between">
                          <span>{locale.locale.toUpperCase()}</span>
                          {locale.locale === defaultLocale ? (
                            <span className="text-xs text-muted-foreground">Default</span>
                          ) : null}
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
                              className="min-h-22 resize-none"
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
          </div>
          </div>
          <DialogFooter className="shrink-0 border-t bg-background px-6 py-4 md:px-8">
            <div className="mx-auto flex w-full max-w-[1248px] gap-3 lg:justify-end">
              <Button
                variant="outline"
                size="lg"
                className="h-12 flex-1 rounded-full px-5 lg:flex-none"
                disabled={isPending}
                onClick={() => onOpenChange(false)}
              >
                Cancel
              </Button>
              <Button
                size="lg"
                className="h-12 flex-1 rounded-full px-6 lg:flex-none"
                type="submit"
                form="create-category-form"
                disabled={isPending}
              >
                {isEdit ? "Save changes" : "Create category"}
              </Button>
            </div>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  )
}
