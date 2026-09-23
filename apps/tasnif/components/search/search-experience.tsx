"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { useSearchParams } from "next/navigation"
import { SearchIcon, XIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty"
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@/components/ui/input-group"
import { Skeleton } from "@/components/ui/skeleton"
import { Spinner } from "@/components/ui/spinner"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { format, type Dictionary, type Locale } from "@/lib/i18n"
import type { Kind, SearchResponse, SearchResult } from "@/lib/types"

import { ResultList, ResultRow } from "./result-row"

type Status = "idle" | "loading" | "done" | "error"
type KindFilter = "all" | Kind

const KINDS: Kind[] = ["catering", "goods", "service"]
const MIN_LENGTH = 2
const DEBOUNCE_MS = 250

function useDebounced(value: string, delay: number) {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(id)
  }, [value, delay])
  return debounced
}

/**
 * The whole search: box, examples, filters, results. Searches as the visitor
 * types (debounced), keeps ?q= in the address bar through the History API so
 * a search can be shared or reloaded without a server round trip, and keeps
 * the previous results on screen while the next ones load, so the list doesn't
 * flash empty on every keystroke.
 */
export function SearchExperience({ locale, t }: { locale: Locale; t: Dictionary }) {
  const searchParams = useSearchParams()
  const [query, setQuery] = useState(() => searchParams.get("q") ?? "")
  const [response, setResponse] = useState<SearchResponse | null>(null)
  const [status, setStatus] = useState<Status>("idle")
  const [filter, setFilter] = useState<KindFilter>("all")
  const [openCode, setOpenCode] = useState<string | null>(null)
  const [attempt, setAttempt] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  const debounced = useDebounced(query.trim(), DEBOUNCE_MS)
  const active = debounced.length >= MIN_LENGTH

  useEffect(() => {
    const url = new URL(window.location.href)
    if (debounced) url.searchParams.set("q", debounced)
    else url.searchParams.delete("q")
    if (url.href !== window.location.href) window.history.replaceState(null, "", url)
  }, [debounced])

  useEffect(() => {
    if (!active) {
      setResponse(null)
      setStatus("idle")
      return
    }
    const controller = new AbortController()
    setStatus("loading")
    fetch(`/api/search?q=${encodeURIComponent(debounced)}`, { signal: controller.signal })
      .then(async (res) => {
        if (!res.ok) throw new Error(`search ${res.status}`)
        return (await res.json()) as SearchResponse
      })
      .then((body) => {
        setResponse(body)
        setStatus("done")
        setFilter("all")
        setOpenCode(null)
      })
      .catch(() => {
        if (!controller.signal.aborted) setStatus("error")
      })
    return () => controller.abort()
  }, [debounced, active, attempt])

  const results = useMemo(() => response?.results ?? [], [response])
  const counts = useMemo(() => {
    const byKind: Record<Kind, number> = { goods: 0, service: 0, catering: 0 }
    for (const result of results) byKind[result.kind] += 1
    return byKind
  }, [results])
  const kindsPresent = KINDS.filter((kind) => counts[kind] > 0)
  const visible: SearchResult[] = filter === "all" ? results : results.filter((r) => r.kind === filter)

  const filterLabels: Record<KindFilter, string> = {
    all: t.search.filterAll,
    goods: t.search.filterGoods,
    service: t.search.filterService,
    catering: t.search.filterCatering,
  }
  const examples = [t.search.example1, t.search.example2, t.search.example3, t.search.example4, t.search.example5]

  return (
    <div className="mt-8 flex flex-col gap-6">
      <form role="search" onSubmit={(event) => event.preventDefault()} className="flex flex-col gap-2">
        <label htmlFor="tasnif-query" className="text-sm font-medium">
          {t.search.label}
        </label>
        <InputGroup className="h-12 bg-background">
          <InputGroupAddon>
            <SearchIcon aria-hidden />
          </InputGroupAddon>
          <InputGroupInput
            ref={inputRef}
            id="tasnif-query"
            type="search"
            inputMode="search"
            enterKeyHint="search"
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            autoFocus
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t.search.placeholder}
            className="text-base [&::-webkit-search-cancel-button]:hidden"
          />
          {query ? (
            <InputGroupAddon align="inline-end">
              <InputGroupButton
                size="icon-sm"
                aria-label={t.search.clear}
                onClick={() => {
                  setQuery("")
                  inputRef.current?.focus()
                }}
              >
                <XIcon />
              </InputGroupButton>
            </InputGroupAddon>
          ) : null}
        </InputGroup>
        {!active ? (
          <div className="flex flex-wrap items-center gap-2 pt-2">
            <span className="text-sm text-muted-foreground">{t.search.examples}:</span>
            {examples.map((example) => (
              <Button
                key={example}
                type="button"
                variant="outline"
                size="sm"
                className={/^\d+$/.test(example) ? "font-mono tabular-nums" : undefined}
                onClick={() => {
                  setQuery(example)
                  inputRef.current?.focus()
                }}
              >
                {example}
              </Button>
            ))}
          </div>
        ) : null}
      </form>

      {active ? (
        <section aria-labelledby="tasnif-results-status" className="flex flex-col gap-3">
          <div className="flex min-h-8 flex-wrap items-center justify-between gap-3">
            <p id="tasnif-results-status" aria-live="polite" className="flex items-center gap-2 text-sm text-muted-foreground">
              {status === "loading" ? (
                <>
                  <Spinner className="size-4" />
                  {t.search.searching}
                </>
              ) : status === "done" ? (
                format(t.search.count, { count: results.length })
              ) : null}
            </p>
            {status !== "error" && kindsPresent.length > 1 ? (
              // Scrolls on its own when it is wider than the screen: in Uzbek the four
              // filters are ~440px, and a phone is 375px.
              <div className="max-w-full overflow-x-auto">
                <ToggleGroup
                  aria-label={t.search.filterLabel}
                  variant="outline"
                  size="sm"
                  spacing={0}
                  value={[filter]}
                  onValueChange={(value: string[]) => setFilter((value.at(-1) as KindFilter | undefined) ?? "all")}
                >
                  {(["all", ...kindsPresent] as KindFilter[]).map((kind) => (
                    <ToggleGroupItem key={kind} value={kind} className="gap-1.5">
                      {filterLabels[kind]}
                      <span className="font-mono text-xs text-muted-foreground tabular-nums">
                        {kind === "all" ? results.length : counts[kind]}
                      </span>
                    </ToggleGroupItem>
                  ))}
                </ToggleGroup>
              </div>
            ) : null}
          </div>

          {status === "error" ? (
            <Empty className="items-start border p-6 text-left">
              <EmptyHeader className="items-start">
                <EmptyTitle>{t.search.errorTitle}</EmptyTitle>
                <EmptyDescription>{t.search.errorHint}</EmptyDescription>
              </EmptyHeader>
              <EmptyContent className="items-start">
                <Button variant="outline" size="sm" onClick={() => setAttempt((n) => n + 1)}>
                  {t.search.retry}
                </Button>
              </EmptyContent>
            </Empty>
          ) : status === "loading" && results.length === 0 ? (
            <ResultsSkeleton />
          ) : status === "done" && results.length === 0 ? (
            <Empty className="items-start border p-6 text-left">
              <EmptyHeader className="items-start">
                <EmptyTitle>{t.search.nothingTitle}</EmptyTitle>
                <EmptyDescription>{t.search.nothingHint}</EmptyDescription>
              </EmptyHeader>
              <EmptyContent className="items-start">
                <a
                  href="https://tasnif.soliq.uz/"
                  target="_blank"
                  rel="noreferrer"
                  className="text-sm underline underline-offset-4 hover:text-muted-foreground"
                >
                  {t.search.requestCode}
                </a>
              </EmptyContent>
            </Empty>
          ) : visible.length > 0 ? (
            <ResultList className={status === "loading" ? "opacity-60 transition-opacity" : undefined}>
              {visible.map((result) => (
                <ResultRow
                  key={`${result.ikpu}-${result.match}`}
                  result={result}
                  locale={locale}
                  t={t}
                  open={openCode === result.ikpu}
                  onToggle={() => setOpenCode((current) => (current === result.ikpu ? null : result.ikpu))}
                />
              ))}
            </ResultList>
          ) : null}
        </section>
      ) : null}
    </div>
  )
}

function ResultsSkeleton() {
  return (
    <div className="flex flex-col divide-y rounded-lg border">
      {[0, 1, 2].map((row) => (
        <div key={row} className="flex flex-col gap-2 px-4 py-4">
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-3 w-1/2" />
        </div>
      ))}
    </div>
  )
}

/** First paint, before the address bar's ?q= is readable: the same box, inert. */
export function SearchFallback({ t }: { t: Dictionary }) {
  return (
    <div className="mt-8 flex flex-col gap-2">
      <span className="text-sm font-medium">{t.search.label}</span>
      <div className="flex h-12 items-center gap-2 rounded-md border border-input px-3 text-base text-muted-foreground">
        <SearchIcon aria-hidden className="size-4" />
        {t.search.placeholder}
      </div>
    </div>
  )
}
