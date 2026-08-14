import { AgentBuilder } from "@/components/console/agent-builder"
import { PageHeader } from "@/components/console/page-header"
import { getDict, type Locale } from "@/lib/i18n"

/**
 * The agent builder, on its own page.
 *
 * It used to live in a box on the templates shelf, under a grid of six cards.
 * That was the wrong shape for what it became: the interview now looks the
 * business up and asks two to four branching questions, and a session that
 * long deserves the whole screen — scrolled, scrollable, and not competing
 * with a catalogue the owner has already decided against by typing.
 *
 * The opening line arrives as `?q=`, so someone who typed on the previous
 * screen never types it twice. It is only ever echoed back into the
 * conversation as the owner's own message, never interpreted as configuration.
 */
export default async function BuildPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: Locale }>
  searchParams: Promise<{ q?: string }>
}) {
  const { locale } = await params
  const { q } = await searchParams
  const dict = getDict(locale)

  return (
    <>
      <PageHeader title={dict.builder.title} subtitle={dict.builder.subtitle} />
      {/*
        No PageBody: this page owns its own scrolling. PageBody pads and grows,
        which would put the composer below the fold and make the transcript
        scroll the whole window instead of itself.
      */}
      <AgentBuilder dict={dict} locale={locale} initialPrompt={q} />
    </>
  )
}
