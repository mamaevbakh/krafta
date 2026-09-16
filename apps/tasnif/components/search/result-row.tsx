"use client"

import { useEffect, useState } from "react"
import { CheckIcon, ChevronDownIcon, CopyIcon, ExternalLinkIcon } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Item, ItemActions, ItemContent, ItemDescription, ItemTitle } from "@/components/ui/item"
import { Skeleton } from "@/components/ui/skeleton"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { format, type Dictionary, type Locale } from "@/lib/i18n"
import type { CodeDetails, Kind, LocalizedName, Match, SearchResult } from "@/lib/types"
import { cn } from "@/lib/utils"

/**
 * Names come from the official catalog, which has Russian and Uzbek but no
 * English. When the interface language has no official name, the Russian one
 * is shown in italics, per DESIGN.md: a visible hint, never a silent fallback.
 */
function localized(name: LocalizedName, locale: Locale): { text: string; fallback: boolean } {
  if (locale === "uz" && name.uzLatn) return { text: name.uzLatn, fallback: false }
  return { text: name.ru, fallback: locale !== "ru" }
}

/**
 * Group names arrive in capitals ("УСЛУГИ ПО РАЗМЕЩЕНИЮ И ОРГАНИЗАЦИИ ПИТАНИЯ", and
 * "TURARJOY VA OVQATLANISh XIZMATLARI" with a stray lowercase digraph). In a
 * breadcrumb, shouting reads like an error, so mostly-capital names are shown in
 * sentence case. Only the display changes.
 */
function readable(text: string) {
  const letters = text.match(/\p{L}/gu) ?? []
  const capitals = letters.filter((letter) => letter !== letter.toLowerCase()).length
  if (letters.length < 4 || capitals / letters.length < 0.8) return text
  const lower = text.toLocaleLowerCase()
  return lower.charAt(0).toLocaleUpperCase() + lower.slice(1)
}

function kindLabel(kind: Kind, t: Dictionary) {
  return { goods: t.result.kindGoods, service: t.result.kindService, catering: t.result.kindCatering }[kind]
}

function matchLabel(match: Match, t: Dictionary) {
  const labels: Partial<Record<Match, string>> = {
    ikpu: t.result.matchIkpu,
    barcode: t.result.matchBarcode,
    package: t.result.matchPackage,
    prefix: t.result.matchPrefix,
    same_category: t.result.matchSameCategory,
  }
  return labels[match] ?? null
}

export function ResultList({ className, children }: { className?: string; children: React.ReactNode }) {
  return <ul className={cn("flex flex-col divide-y rounded-lg border", className)}>{children}</ul>
}

export function ResultRow({
  result,
  locale,
  t,
  open,
  onToggle,
}: {
  result: SearchResult
  locale: Locale
  t: Dictionary
  open: boolean
  onToggle: () => void
}) {
  const name = localized(result.name, locale)
  // A category-level code usually carries its category's own name; saying it twice is noise.
  const categoryName = result.category ? localized(result.category, locale) : null
  const category = categoryName && categoryName.text !== name.text ? categoryName : null
  const match = matchLabel(result.match, t)
  const detailsId = `details-${result.ikpu}-${result.match}`

  return (
    <li>
      <Item size="sm" className="flex-wrap items-start gap-x-4 gap-y-3 rounded-none px-4 py-3.5 sm:flex-nowrap">
        <ItemContent className="min-w-0 basis-full sm:basis-auto">
          <ItemTitle
            className={cn("line-clamp-3 w-auto text-[15px] text-pretty", name.fallback && "italic")}
            title={name.fallback ? t.result.fallbackName : undefined}
          >
            {name.text}
          </ItemTitle>
          <ItemDescription className="line-clamp-none">
            {category ? <span className={cn(category.fallback && "italic")}>{category.text}</span> : null}
            {category ? <span aria-hidden> · </span> : null}
            <span>{kindLabel(result.kind, t)}</span>
          </ItemDescription>
          {match || result.isBranded || result.status === "inactive" ? (
            <div className="flex flex-wrap gap-1.5 pt-1">
              {result.status === "inactive" ? <Badge variant="destructive">{t.result.inactive}</Badge> : null}
              {match ? <Badge variant="secondary">{match}</Badge> : null}
              {result.isBranded ? <Badge variant="outline">{t.result.branded}</Badge> : null}
            </div>
          ) : null}
        </ItemContent>
        <ItemActions className="w-full justify-between sm:w-auto sm:justify-end">
          <CopyCode code={result.ikpu} t={t} />
          <Button
            variant="ghost"
            size="icon-sm"
            aria-expanded={open}
            aria-controls={detailsId}
            aria-label={open ? t.result.hideDetails : t.result.showDetails}
            onClick={onToggle}
          >
            <ChevronDownIcon className={cn("transition-transform duration-150 ease-out", open && "rotate-180")} />
          </Button>
        </ItemActions>
      </Item>
      {open ? <CodeDetailsPanel id={detailsId} ikpu={result.ikpu} locale={locale} t={t} /> : null}
    </li>
  )
}

/** The 17 digits are the button: clicking the code copies it. */
export function CopyCode({ code, t, className }: { code: string | number; t: Dictionary; className?: string }) {
  const [copied, setCopied] = useState(false)
  useEffect(() => {
    if (!copied) return
    const id = setTimeout(() => setCopied(false), 1600)
    return () => clearTimeout(id)
  }, [copied])

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className={cn("font-mono tabular-nums", className)}
        aria-label={format(t.result.copy, { code })}
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(String(code))
            setCopied(true)
          } catch {
            // Clipboard can be blocked (insecure context, permissions); the code stays visible to copy by hand.
          }
        }}
      >
        {code}
        {copied ? <CheckIcon data-icon="inline-end" /> : <CopyIcon data-icon="inline-end" className="text-muted-foreground" />}
      </Button>
      <span aria-live="polite" className="sr-only">
        {copied ? format(t.result.copied, { code }) : ""}
      </span>
    </>
  )
}

const detailsCache = new Map<string, CodeDetails>()

function CodeDetailsPanel({ id, ikpu, locale, t }: { id: string; ikpu: string; locale: Locale; t: Dictionary }) {
  const [details, setDetails] = useState<CodeDetails | null>(() => detailsCache.get(ikpu) ?? null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    if (detailsCache.has(ikpu)) return
    const controller = new AbortController()
    fetch(`/api/codes/${ikpu}`, { signal: controller.signal })
      .then(async (res) => {
        if (!res.ok) throw new Error(`details ${res.status}`)
        return (await res.json()) as CodeDetails
      })
      .then((body) => {
        detailsCache.set(ikpu, body)
        setDetails(body)
      })
      .catch(() => {
        if (!controller.signal.aborted) setFailed(true)
      })
    return () => controller.abort()
  }, [ikpu])

  return (
    <div id={id} className="mx-4 mb-4 rounded-md bg-muted/50 px-4 py-4 text-sm">
      {failed ? (
        <p className="text-muted-foreground">{t.details.error}</p>
      ) : !details ? (
        <div className="flex flex-col gap-2" aria-label={t.details.loading}>
          <Skeleton className="h-3 w-2/3" />
          <Skeleton className="h-3 w-1/2" />
          <Skeleton className="h-3 w-1/3" />
        </div>
      ) : (
        <DetailsBody details={details} locale={locale} t={t} />
      )}
    </div>
  )
}

function DetailsBody({ details, locale, t }: { details: CodeDetails; locale: Locale; t: Dictionary }) {
  const facts: { label: string; value: string; mono?: boolean }[] = []
  if (details.path.length > 0) {
    facts.push({ label: t.details.path, value: details.path.map((node) => readable(localized(node, locale).text)).join(" › ") })
  }
  if (details.units) facts.push({ label: t.details.units, value: details.units })
  if (details.barcode) facts.push({ label: t.details.barcode, value: details.barcode, mono: true })
  if (details.brand) facts.push({ label: t.details.brand, value: details.brand })
  if (details.benefit) facts.push({ label: t.details.benefit, value: details.benefit })
  if (locale === "uz" && details.name.uzCyrl) facts.push({ label: t.details.nameUzCyrl, value: details.name.uzCyrl })

  return (
    <div className="flex flex-col gap-4">
      {details.status === "inactive" ? <p className="text-destructive">{t.details.inactiveNotice}</p> : null}

      <dl className="grid grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-[max-content_1fr]">
        {facts.map((fact) => (
          <div key={fact.label} className="contents">
            <dt className="text-muted-foreground">{fact.label}</dt>
            <dd className={cn("text-pretty", fact.mono && "font-mono tabular-nums")}>{fact.value}</dd>
          </div>
        ))}
      </dl>

      <div className="flex flex-col gap-2">
        <h3 className="font-medium">{t.details.packages}</h3>
        {details.packages.length === 0 ? (
          <p className="text-muted-foreground">{t.details.noPackages}</p>
        ) : (
          <div className="overflow-x-auto rounded-md border bg-background">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-0">{t.details.packageCode}</TableHead>
                  <TableHead>{t.details.packageName}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {details.packages.map((pack) => (
                  <TableRow key={pack.code}>
                    <TableCell className="align-top">
                      <CopyCode code={pack.code} t={t} className="h-7" />
                    </TableCell>
                    <TableCell className="align-top whitespace-normal">
                      <div>{pack.name}</div>
                      {pack.origin ? (
                        <div className="text-xs text-muted-foreground">
                          {pack.origin === "fixed" ? t.details.originFixed : t.details.originUser}
                        </div>
                      ) : null}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      <a
        href={`https://tasnif.soliq.uz/attribute/${details.ikpu}`}
        target="_blank"
        rel="noreferrer"
        className="inline-flex w-fit items-center gap-1.5 underline underline-offset-4 hover:text-muted-foreground"
      >
        {t.details.official}
        <ExternalLinkIcon className="size-3.5" aria-hidden />
      </a>
    </div>
  )
}
