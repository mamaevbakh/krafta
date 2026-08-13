"use server"

import { revalidatePath } from "next/cache"

import { ingestDocument } from "@/lib/knowledge/ingest"
import { getSelectedOrg } from "@/lib/orgs"
import { createClient } from "@/lib/supabase/server"

export type AddKnowledgeResult =
  | { ok: true; chunkCount: number; unchanged: boolean }
  | { ok: false; error: string }

/**
 * Adds a pasted document to the current business's knowledge base.
 *
 * The organisation comes from `getSelectedOrg()`, which re-checks membership —
 * it is never taken from the form. A hidden org field would let anyone POST
 * knowledge into another merchant's agent, which is both a data-integrity and
 * a reputational problem: their agent would start answering with your text.
 */
export async function addKnowledge(
  _prev: AddKnowledgeResult | null,
  formData: FormData
): Promise<AddKnowledgeResult> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: "not_signed_in" }

  const org = await getSelectedOrg()
  if (!org) return { ok: false, error: "no_business_selected" }

  const title = String(formData.get("title") ?? "").trim()
  const text = String(formData.get("text") ?? "").trim()
  const lang = String(formData.get("lang") ?? "").trim() || undefined

  if (!title) return { ok: false, error: "title_required" }
  if (text.length < 20) return { ok: false, error: "text_too_short" }

  try {
    const result = await ingestDocument({
      orgId: org.id,
      title,
      text,
      source: "manual",
      lang,
      uploadedBy: user.id,
    })
    revalidatePath("/[locale]/knowledge", "page")
    return {
      ok: true,
      chunkCount: result.chunkCount,
      unchanged: result.unchanged,
    }
  } catch (error) {
    // Surface the reason rather than a generic failure — "embedding_failed_429"
    // tells the merchant to retry in a minute, "document_has_no_text" tells
    // them their paste didn't land.
    return {
      ok: false,
      error: error instanceof Error ? error.message.slice(0, 200) : "unknown",
    }
  }
}
