"use client"

import { Check, Trash2, XIcon } from "lucide-react"
import { useEffect, useMemo, useRef, useState, useTransition } from "react"
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
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { Spinner } from "@/components/ui/spinner"
import { cn } from "@/lib/utils"
import type { CatalogCategory, Item } from "@/lib/catalogs/types"
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer"
import { createItem, updateItem } from "./actions"
import { createClient as createBrowserClient } from "@/lib/supabase/client"

type LocaleOption = {
  id: string
  locale: string
  is_default: boolean
  is_enabled: boolean
  sort_order: number
}

type TranslationState = {
  name: string
  description: string
  image_alt: string
}

type UploadCommit = {
  id: string
  bucket: string
  storage_path: string
  kind: "image" | "video"
  mime_type: string | null
  bytes: number | null
  title: string | null
  alt: string | null
}

type PendingUpload = {
  clientId: string
  preview: string
  fileName: string
  isVideo: boolean
  status: "uploading" | "uploaded" | "error"
  error?: string
  upload?: UploadCommit
}

type CreateItemDrawerProps = {
  orgId: string
  catalogId: string
  catalogSlug: string
  categories: CatalogCategory[]
  locales: LocaleOption[]
  open: boolean
  onOpenChange: (open: boolean) => void
  mode?: "create" | "edit"
  item?: Item
  initialTranslations?: {
    id: string
    item_id: string
    locale: string
    name: string
    description: string | null
    image_alt: string | null
  }[]
  initialMedia?: {
    id: string
    item_id: string
    bucket: string
    storage_path: string
    mime_type: string | null
    kind: "image" | "video"
    title: string | null
    alt: string | null
    position: number
    is_primary: boolean
  }[]
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/['"]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
}

function formatPriceInput(value: number | null): string {
  if (typeof value !== "number") return ""
  return (value / 100).toFixed(2)
}

export function CreateItemDrawer({
  orgId,
  catalogId,
  catalogSlug,
  categories,
  locales,
  open,
  onOpenChange,
  mode = "create",
  item,
  initialTranslations = [],
  initialMedia = [],
}: CreateItemDrawerProps) {
  const router = useRouter()
  const [aiOpen, setAiOpen] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

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
  const [slugValue, setSlugValue] = useState("")
  const [slugTouched, setSlugTouched] = useState(false)
  const [priceValue, setPriceValue] = useState("")
  const [categoryId, setCategoryId] = useState("")
  const [pendingUploads, setPendingUploads] = useState<PendingUpload[]>([])
  const [existingMedia, setExistingMedia] = useState(initialMedia)
  const [mediaToDelete, setMediaToDelete] = useState<string[]>([])
  const [draftItemId, setDraftItemId] = useState<string | null>(null)
  const [didSave, setDidSave] = useState(false)
  const pendingUploadsRef = useRef<PendingUpload[]>([])

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
        image_alt: existing?.image_alt ?? "",
      }
    })
    setTranslations(nextTranslations)
    setSlugTouched(false)
    setSlugValue(item?.slug ?? "")
    setPriceValue(formatPriceInput(item?.price_cents ?? null))
    setCategoryId(item?.category_id ?? "")
    setPendingUploads((prev) => {
      prev.forEach((upload) => URL.revokeObjectURL(upload.preview))
      return []
    })
    setExistingMedia(initialMedia)
    setMediaToDelete([])
    setDraftItemId(mode === "edit" ? null : crypto.randomUUID())
    setDidSave(false)
    setErrorMessage(null)
  }, [enabledLocales, initialMedia, initialTranslations, item, mode, open])

  useEffect(() => {
    pendingUploadsRef.current = pendingUploads
  }, [pendingUploads])

  useEffect(() => {
    return () => {
      pendingUploadsRef.current.forEach((upload) =>
        URL.revokeObjectURL(upload.preview),
      )
    }
  }, [])

  const storageBaseUrl =
    process.env.NEXT_PUBLIC_SUPABASE_URL ??
    process.env.NEXT_PUBLIC_KRAFTA_SUPABASE_URL ??
    ""

  const defaultName = translations[defaultLocale]?.name ?? ""
  const defaultDescription = translations[defaultLocale]?.description ?? ""
  const defaultImageAlt = translations[defaultLocale]?.image_alt ?? ""
  const isEdit = mode === "edit" && !!item
  const slugPreview = slugValue.trim()
  const mediaTargetId = isEdit ? item?.id ?? null : draftItemId
  const isUploadingMedia = pendingUploads.some(
    (upload) => upload.status === "uploading",
  )

  useEffect(() => {
    if (!open) return
    if (slugTouched) return
    if (isEdit && item?.slug) {
      setSlugValue(item.slug)
      return
    }
    const nextSlug = slugify(defaultName)
    setSlugValue(nextSlug)
  }, [defaultName, isEdit, item?.slug, open, slugTouched])

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

  function parsePriceCents(value: string): number {
    const normalized = value.replace(/,/g, ".")
    const parsed = Number.parseFloat(normalized)
    if (Number.isNaN(parsed)) return 0
    return Math.round(parsed * 100)
  }

  async function commitMediaUploads(
    targetItemId: string,
    uploads: UploadCommit[],
  ) {
    if (!uploads.length) return []

    const response = await fetch("/api/items/media", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        itemId: targetItemId,
        uploads,
      }),
    })

    if (!response.ok) {
      const data = await response.json().catch(() => null)
      throw new Error(data?.error ?? "Failed to save media.")
    }

    const data = (await response.json().catch(() => null)) as
      | { media?: typeof existingMedia }
      | null

    return data?.media ?? []
  }

  async function cleanupPendingUploads(entries: PendingUpload[]) {
    const toRemove = entries
      .map((entry) => entry.upload)
      .filter((upload): upload is UploadCommit => !!upload)

    if (!toRemove.length) return

    await fetch("/api/items/media/cleanup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        entries: toRemove.map((upload) => ({
          bucket: upload.bucket,
          storage_path: upload.storage_path,
        })),
      }),
    })
  }

  async function startMediaUpload(
    targetItemId: string,
    files: File[],
    clientIds: string[],
  ) {
    if (!files.length) return

    const response = await fetch("/api/items/media/upload-url", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        itemId: targetItemId,
        orgId,
        catalogId,
        files: files.map((file) => ({
          name: file.name,
          type: file.type,
          size: file.size,
        })),
      }),
    })

    if (!response.ok) {
      const data = await response.json().catch(() => null)
      const message = data?.error ?? "Failed to prepare uploads."
      setErrorMessage(message)
      setPendingUploads((prev) =>
        prev.map((entry) =>
          clientIds.includes(entry.clientId)
            ? { ...entry, status: "error", error: message }
            : entry,
        ),
      )
      return
    }

    const data = (await response.json().catch(() => null)) as
      | {
          uploads?: Array<{
            id: string
            bucket: string
            storagePath: string
            token: string
            kind: "image" | "video"
            mimeType: string | null
            bytes: number | null
          }>
        }
      | null

    const uploads = data?.uploads ?? []

    if (!uploads.length) {
      const message = "Failed to prepare uploads."
      setErrorMessage(message)
      setPendingUploads((prev) =>
        prev.map((entry) =>
          clientIds.includes(entry.clientId)
            ? { ...entry, status: "error", error: message }
            : entry,
        ),
      )
      return
    }

    const uploadByClientId = new Map(
      clientIds.map((clientId, index) => [
        clientId,
        uploads[index],
      ]),
    )

    const supabase = createBrowserClient()

    const results = await Promise.all(
      uploads.map((upload, index) =>
        supabase.storage
          .from(upload.bucket)
          .uploadToSignedUrl(
            upload.storagePath,
            upload.token,
            files[index],
            {
              contentType: files[index]?.type || undefined,
            },
          ),
      ),
    )

    const failedClientIds = new Set<string>()
    const successfulClientIds = new Set<string>()
    const successfulByClientId = new Map<string, UploadCommit>()

    results.forEach((result, index) => {
      const clientId = clientIds[index]
      const upload = uploads[index]
      if (!clientId || !upload || result.error) {
        failedClientIds.add(clientId)
        return
      }
      successfulClientIds.add(clientId)
      successfulByClientId.set(clientId, {
        id: upload.id,
        bucket: upload.bucket,
        storage_path: upload.storagePath,
        kind: upload.kind,
        mime_type: upload.mimeType ?? null,
        bytes: upload.bytes ?? null,
        title: defaultName || null,
        alt: defaultImageAlt || null,
      })
    })

    setPendingUploads((prev) =>
      prev.map((entry) => {
        if (!uploadByClientId.has(entry.clientId)) return entry
        if (failedClientIds.has(entry.clientId)) {
          return {
            ...entry,
            status: "error",
            error: "Upload failed.",
          }
        }
        const upload = uploadByClientId.get(entry.clientId)
        if (!upload) return entry
        return {
          ...entry,
          status: "uploaded",
          upload: {
            id: upload.id,
            bucket: upload.bucket,
            storage_path: upload.storagePath,
            kind: upload.kind,
            mime_type: upload.mimeType ?? null,
            bytes: upload.bytes ?? null,
            title: defaultName || null,
            alt: defaultImageAlt || null,
          },
        }
      }),
    )

    if (failedClientIds.size) {
      setErrorMessage("Some uploads failed. Please try again.")
    }

    const activeClientIds = new Set(
      pendingUploadsRef.current.map((entry) => entry.clientId),
    )
    const committedClientIds = new Set(
      [...successfulClientIds].filter((clientId) =>
        activeClientIds.has(clientId),
      ),
    )
    const committedUploads = [...committedClientIds]
      .map((clientId) => successfulByClientId.get(clientId))
      .filter((upload): upload is UploadCommit => !!upload)

    if (isEdit && item?.id && committedUploads.length) {
      try {
        const media = await commitMediaUploads(item.id, committedUploads)
        setExistingMedia((prev) => [
          ...prev.map((entry) => ({ ...entry, is_primary: false })),
          ...media,
        ])
        setPendingUploads((prev) =>
          prev.filter((entry) => !committedClientIds.has(entry.clientId)),
        )
      } catch (error) {
        setErrorMessage(
          (error as Error)?.message ?? "Failed to save media.",
        )
      }
    }
  }

  async function deleteMedia(targetItemId: string, mediaIds: string[]) {
    if (!mediaIds.length) return

    const response = await fetch("/api/items/media", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        itemId: targetItemId,
        mediaIds,
      }),
    })

    if (!response.ok) {
      const data = await response.json().catch(() => null)
      throw new Error(data?.error ?? "Failed to delete media.")
    }
  }

  async function setDefaultMedia(targetItemId: string, mediaId: string) {
    const response = await fetch("/api/items/media", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        itemId: targetItemId,
        mediaId,
      }),
    })

    if (!response.ok) {
      const data = await response.json().catch(() => null)
      throw new Error(data?.error ?? "Failed to update media.")
    }
  }

  function removePendingUpload(entry: PendingUpload) {
    URL.revokeObjectURL(entry.preview)
    setPendingUploads((prev) =>
      prev.filter((upload) => upload.clientId !== entry.clientId),
    )
    if (entry.status === "uploaded" && entry.upload) {
      void cleanupPendingUploads([entry])
    }
  }

  useEffect(() => {
    if (open || didSave) return
    const pending = pendingUploadsRef.current.filter(
      (entry) => entry.status === "uploaded" && entry.upload,
    )
    if (!pending.length) return

    void cleanupPendingUploads(pending)
    setPendingUploads((prev) => {
      prev.forEach((upload) => URL.revokeObjectURL(upload.preview))
      return []
    })
  }, [didSave, open])

  return (
    <Drawer direction="right" open={open} onOpenChange={onOpenChange}>
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
                {isEdit ? "Edit item" : "Create item"}
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
              id="create-item-form"
              className="space-y-6"
              onSubmit={(event) => {
                event.preventDefault()
                setErrorMessage(null)

                startTransition(async () => {
                  if (!categoryId) {
                    setErrorMessage("Category is required.")
                    return
                  }

                  if (pendingUploads.some((upload) => upload.status === "uploading")) {
                    setErrorMessage("Please wait for media uploads to finish.")
                    return
                  }

                  const readyUploads = pendingUploads
                    .map((upload) =>
                      upload.upload
                        ? {
                            ...upload.upload,
                            title: defaultName || null,
                            alt: defaultImageAlt || null,
                          }
                        : null,
                    )
                    .filter((upload): upload is UploadCommit => !!upload)

                  const payload = enabledLocales.map((locale) => ({
                    locale: locale.locale,
                    name: translations[locale.locale]?.name ?? "",
                    description: translations[locale.locale]?.description ?? "",
                    image_alt: translations[locale.locale]?.image_alt ?? "",
                  }))

                  const priceCents = parsePriceCents(priceValue)

                  if (isEdit) {
                    const result = await updateItem({
                      catalogId,
                      catalogSlug,
                      itemId: item.id,
                      categoryId,
                      name: defaultName,
                      slug: slugValue,
                      priceCents,
                      description: defaultDescription,
                      imageAlt: defaultImageAlt,
                      translations: payload,
                    })

                    if (!result.ok) {
                      setErrorMessage(result.error ?? "Unable to save item.")
                      return
                    }

                    if (mediaToDelete.length) {
                      try {
                        await deleteMedia(item.id, mediaToDelete)
                        setMediaToDelete([])
                      } catch (error) {
                        setErrorMessage(
                          (error as Error)?.message ?? "Failed to delete media.",
                        )
                        return
                      }
                    }

                    if (readyUploads.length) {
                      try {
                        const media = await commitMediaUploads(
                          item.id,
                          readyUploads,
                        )
                        setExistingMedia((prev) => [
                          ...prev.map((entry) => ({ ...entry, is_primary: false })),
                          ...media,
                        ])
                        setPendingUploads((prev) => {
                          prev.forEach((upload) =>
                            URL.revokeObjectURL(upload.preview),
                          )
                          return []
                        })
                      } catch (error) {
                        setErrorMessage(
                          (error as Error)?.message ?? "Failed to save media.",
                        )
                        return
                      }
                    }
                  } else {
                    const nextItemId = draftItemId ?? crypto.randomUUID()
                    const result = await createItem({
                      itemId: nextItemId,
                      catalogId,
                      catalogSlug,
                      categoryId,
                      name: defaultName,
                      slug: slugValue,
                      priceCents,
                      description: defaultDescription,
                      imageAlt: defaultImageAlt,
                      translations: payload,
                    })

                    if (!result.ok) {
                      setErrorMessage(result.error ?? "Unable to save item.")
                      return
                    }

                    if (!result.itemId) {
                      setErrorMessage("Item was created without an id.")
                      return
                    }

                    if (readyUploads.length) {
                      try {
                        await commitMediaUploads(result.itemId, readyUploads)
                      } catch (error) {
                        setErrorMessage(
                          (error as Error)?.message ?? "Failed to save media.",
                        )
                        return
                      }
                    }
                  }

                  setPendingUploads((prev) => {
                    prev.forEach((upload) =>
                      URL.revokeObjectURL(upload.preview),
                    )
                    return []
                  })
                  setDidSave(true)
                  onOpenChange(false)
                  router.refresh()
                })
              }}
            >
              <FieldGroup>
                <FieldSet>
                  <FieldLegend>Item details</FieldLegend>
                  <FieldDescription>
                    Add translations for the locales in this catalog.
                  </FieldDescription>
                  <FieldGroup className="@container/field-group flex flex-col gap-5">
                    {enabledLocales.map((locale, index) => (
                      <FieldSet key={locale.id} className="space-y-4 rounded-lg border p-4">
                        <FieldLegend variant="label" className="flex items-center justify-between">
                          <span>{locale.locale.toUpperCase()}</span>
                          {locale.locale === defaultLocale && (
                            <span className="text-xs text-muted-foreground">Default</span>
                          )}
                        </FieldLegend>
                        <FieldGroup className="gap-4">
                          <Field>
                            <FieldLabel htmlFor={`item-name-${locale.id}`}>
                              Name
                            </FieldLabel>
                            <Input
                              id={`item-name-${locale.id}`}
                              placeholder="Item name"
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
                                This name is used as the main item label.
                              </FieldDescription>
                            )}
                          </Field>

                          {locale.locale === defaultLocale && (
                            <>
                              <Field>
                                <FieldLabel htmlFor={`item-slug-${locale.id}`}>
                                  Slug
                                </FieldLabel>
                                <Input
                                  id={`item-slug-${locale.id}`}
                                  placeholder="item-slug"
                                  value={slugValue}
                                  onChange={(event) => {
                                    setSlugTouched(true)
                                    setSlugValue(slugify(event.target.value))
                                  }}
                                />
                                <FieldDescription className="text-xs">
                                  krafta.uz/{catalogSlug}/{slugPreview || "item-slug"}
                                </FieldDescription>
                              </Field>

                              <Field>
                                <FieldLabel htmlFor={`item-category-${locale.id}`}>
                                  Category
                                </FieldLabel>
                                <Select value={categoryId} onValueChange={setCategoryId}>
                                  <SelectTrigger id={`item-category-${locale.id}`}>
                                    <SelectValue placeholder="Select category" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectGroup>
                                      {categories.map((category) => (
                                        <SelectItem key={category.id} value={category.id}>
                                          {category.name}
                                        </SelectItem>
                                      ))}
                                    </SelectGroup>
                                  </SelectContent>
                                </Select>
                              </Field>

                              <Field>
                                <FieldLabel htmlFor={`item-price-${locale.id}`}>
                                  Price
                                </FieldLabel>
                                <Input
                                  id={`item-price-${locale.id}`}
                                  placeholder="0.00"
                                  inputMode="decimal"
                                  value={priceValue}
                                  onChange={(event) => setPriceValue(event.target.value)}
                                />
                                <FieldDescription>
                                  Price is stored in cents and formatted automatically.
                                </FieldDescription>
                              </Field>
                            </>
                          )}

                          {locale.locale === defaultLocale && (
                            <Field>
                              <FieldLabel htmlFor={`item-media-${locale.id}`}>
                                Media
                              </FieldLabel>
                              <Input
                                id={`item-media-${locale.id}`}
                                type="file"
                                multiple
                                accept="image/*,video/*"
                                onChange={(event) => {
                                  const files = Array.from(
                                    event.target.files ?? [],
                                  )
                                  if (!files.length) return
                                  if (!mediaTargetId) {
                                    setErrorMessage(
                                      "Save item details before uploading media.",
                                    )
                                    return
                                  }
                                  const clientIds = files.map(() =>
                                    crypto.randomUUID(),
                                  )
                                  const previews = files.map((file) =>
                                    URL.createObjectURL(file),
                                  )
                                  setPendingUploads((prev) => [
                                    ...prev,
                                    ...files.map((file, index) => ({
                                      clientId: clientIds[index],
                                      preview: previews[index],
                                      fileName: file.name,
                                      isVideo: file.type.startsWith("video"),
                                      status: "uploading" as const,
                                    })),
                                  ])
                                  event.target.value = ""
                                  void startMediaUpload(
                                    mediaTargetId,
                                    files,
                                    clientIds,
                                  )
                                }}
                              />
                              <FieldDescription className="text-xs">
                                Upload an image or video for this item.
                              </FieldDescription>
                              {existingMedia.length ? (
                                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                                  {existingMedia.map((entry) => {
                                    const url = storageBaseUrl
                                      ? `${storageBaseUrl}/storage/v1/object/public/${entry.bucket}/${entry.storage_path}`
                                      : entry.storage_path
                                    const isVideo =
                                      entry.kind === "video" ||
                                      entry.mime_type?.startsWith("video")

                                    return (
                                      <div
                                        key={entry.id}
                                        className="group relative overflow-hidden rounded-md border bg-muted/40"
                                      >
                                        {isVideo ? (
                                          <video
                                            src={url}
                                            controls
                                            className="max-h-48 w-full object-cover"
                                          />
                                        ) : (
                                          <img
                                            src={url}
                                            alt={entry.alt ?? "Media"}
                                            className="max-h-48 w-full object-cover"
                                          />
                                        )}
                                        {entry.is_primary ? (
                                          <span className="absolute left-2 top-2 rounded-full bg-white/90 px-2 py-0.5 text-[10px] font-semibold text-black">
                                            Default
                                          </span>
                                        ) : (
                                          <button
                                            type="button"
                                            aria-label="Set as default"
                                            onClick={async () => {
                                              if (!item?.id) return
                                              try {
                                                await setDefaultMedia(item.id, entry.id)
                                                setExistingMedia((prev) =>
                                                  prev.map((media) => ({
                                                    ...media,
                                                    is_primary: media.id === entry.id,
                                                  })),
                                                )
                                              } catch (error) {
                                                setErrorMessage(
                                                  (error as Error)?.message ??
                                                    "Failed to update media.",
                                                )
                                              }
                                            }}
                                            className="absolute left-2 top-2 inline-flex h-8 w-8 items-center justify-center rounded-full bg-black/70 text-white opacity-0 transition group-hover:opacity-100"
                                          >
                                            <Check className="h-4 w-4" />
                                          </button>
                                        )}
                                        <button
                                          type="button"
                                          aria-label="Remove media"
                                          onClick={() => {
                                            setExistingMedia((prev) =>
                                              prev
                                                .filter((media) => media.id !== entry.id)
                                                .map((media, index, list) => {
                                                  if (list.some((item) => item.is_primary)) {
                                                    return media
                                                  }
                                                  if (index === 0) {
                                                    return { ...media, is_primary: true }
                                                  }
                                                  return media
                                                }),
                                            )
                                            setMediaToDelete((prev) =>
                                              prev.includes(entry.id)
                                                ? prev
                                                : [...prev, entry.id],
                                            )
                                          }}
                                          className="absolute right-2 top-2 inline-flex h-8 w-8 items-center justify-center rounded-full bg-black/70 text-white opacity-0 transition group-hover:opacity-100"
                                        >
                                          <Trash2 className="h-4 w-4" />
                                        </button>
                                      </div>
                                    )
                                  })}
                                </div>
                              ) : null}

                              {pendingUploads.length ? (
                                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                                  {pendingUploads.map((entry) => (
                                    <div
                                      key={entry.clientId}
                                      className="group relative overflow-hidden rounded-md border bg-muted/40"
                                    >
                                      {entry.isVideo ? (
                                        <video
                                          src={entry.preview}
                                          controls
                                          className="max-h-48 w-full object-cover"
                                        />
                                      ) : (
                                        <img
                                          src={entry.preview}
                                          alt={entry.fileName}
                                          className="max-h-48 w-full object-cover"
                                        />
                                      )}
                                      {entry.status === "uploading" && (
                                        <div className="absolute inset-0 flex items-center justify-center gap-2 bg-black/40 text-xs font-medium text-white">
                                          <Spinner className="size-4 text-white" />
                                          Uploading
                                        </div>
                                      )}
                                      {entry.status === "uploaded" && (
                                        <span className="absolute left-2 top-2 rounded-full bg-white/90 px-2 py-0.5 text-[10px] font-semibold text-black">
                                          Ready
                                        </span>
                                      )}
                                      {entry.status === "error" && (
                                        <span className="absolute left-2 top-2 rounded-full bg-destructive px-2 py-0.5 text-[10px] font-semibold text-white">
                                          Failed
                                        </span>
                                      )}
                                      <button
                                        type="button"
                                        aria-label="Remove pending media"
                                        onClick={() => removePendingUpload(entry)}
                                        className="absolute right-2 top-2 inline-flex h-8 w-8 items-center justify-center rounded-full bg-black/70 text-white opacity-0 transition group-hover:opacity-100"
                                      >
                                        <Trash2 className="h-4 w-4" />
                                      </button>
                                    </div>
                                  ))}
                                </div>
                              ) : null}
                            </Field>
                          )}

                          <Field>
                            <FieldLabel htmlFor={`item-description-${locale.id}`}>
                              Description
                            </FieldLabel>
                            <Textarea
                              id={`item-description-${locale.id}`}
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

                          <Field>
                            <FieldLabel htmlFor={`item-image-alt-${locale.id}`}>
                              Image alt text
                            </FieldLabel>
                            <Input
                              id={`item-image-alt-${locale.id}`}
                              placeholder="Optional alt text"
                              value={translations[locale.locale]?.image_alt ?? ""}
                              onChange={(event) =>
                                updateTranslation(
                                  locale.locale,
                                  "image_alt",
                                  event.target.value,
                                )
                              }
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
                    description="Describe the item and Krafta AI will help."
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
              form="create-item-form"
              disabled={isPending || isUploadingMedia}
            >
              {isUploadingMedia
                ? "Uploading media..."
                : isEdit
                  ? "Save changes"
                  : "Create item"}
            </Button>
          </div>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  )
}
