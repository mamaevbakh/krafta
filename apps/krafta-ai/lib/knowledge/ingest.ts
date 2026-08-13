import { createHash } from "node:crypto"
import { createClient } from "@supabase/supabase-js"

import { chunkText } from "./chunk"
import { EMBEDDING_MODEL, embedTexts, toVectorLiteral } from "./embed"

export type IngestInput = {
  orgId: string
  title: string
  text: string
  source?: string
  lang?: string
  agentId?: string | null
  uploadedBy?: string | null
}

export type IngestResult = {
  documentId: string
  chunkCount: number
  /** True when identical content was already ingested and nothing was re-embedded. */
  unchanged: boolean
}

function adminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SECRET_KEY
  if (!url || !key) throw new Error("missing_supabase_admin_credentials")
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
    db: { schema: "agent" },
  })
}

/**
 * Ingests one document for one business: chunk, embed, store.
 *
 * Idempotent by content hash. Re-uploading the same price list must not double
 * the corpus — duplicated chunks don't just waste money on embeddings, they
 * crowd the retrieval window so the agent sees the same paragraph three times
 * and misses the one that actually answers the question.
 *
 * Runs under service_role, so `org_id` is written explicitly on the document
 * AND denormalised onto every chunk. RLS is not protecting this path; the
 * explicit column is.
 */
export async function ingestDocument(input: IngestInput): Promise<IngestResult> {
  const db = adminClient()
  const contentHash = createHash("sha256").update(input.text).digest("hex")

  const { data: existing } = await db
    .from("documents")
    .select("id, chunk_count")
    .eq("org_id", input.orgId)
    .eq("content_hash", contentHash)
    .eq("status", "ready")
    .maybeSingle()

  if (existing) {
    return {
      documentId: String((existing as { id: string }).id),
      chunkCount: Number((existing as { chunk_count: number }).chunk_count ?? 0),
      unchanged: true,
    }
  }

  const chunks = chunkText(input.text)
  if (chunks.length === 0) throw new Error("document_has_no_text")

  const { data: doc, error: docError } = await db
    .from("documents")
    .insert({
      org_id: input.orgId,
      agent_id: input.agentId ?? null,
      title: input.title,
      source: input.source ?? "upload",
      lang: input.lang ?? null,
      content_hash: contentHash,
      byte_size: Buffer.byteLength(input.text, "utf8"),
      status: "processing",
      uploaded_by: input.uploadedBy ?? null,
    })
    .select("id")
    .single()

  if (docError || !doc) {
    throw new Error(`document_insert_failed: ${docError?.message ?? "unknown"}`)
  }
  const documentId = String((doc as { id: string }).id)

  try {
    const embeddings = await embedTexts(chunks.map((c) => c.content))

    const { error: chunkError } = await db.from("doc_chunks").insert(
      chunks.map((c, i) => ({
        org_id: input.orgId,
        document_id: documentId,
        agent_id: input.agentId ?? null,
        chunk_index: c.index,
        content: c.content,
        lang: input.lang ?? null,
        embedding: toVectorLiteral(embeddings[i]),
        embedding_model: EMBEDDING_MODEL,
        embedded_at: new Date().toISOString(),
        retrievable: true,
      }))
    )
    if (chunkError) throw new Error(`chunk_insert_failed: ${chunkError.message}`)

    await db
      .from("documents")
      .update({
        status: "ready",
        chunk_count: chunks.length,
        ingested_at: new Date().toISOString(),
      })
      .eq("id", documentId)

    return { documentId, chunkCount: chunks.length, unchanged: false }
  } catch (error) {
    // Leave the failure visible on the row rather than deleting it. A merchant
    // who uploaded a file and sees nothing cannot tell "still working" from
    // "gave up"; a document stuck in `failed` with a reason is a support
    // conversation that resolves in one message.
    await db
      .from("documents")
      .update({
        status: "failed",
        error: error instanceof Error ? error.message.slice(0, 500) : "unknown",
      })
      .eq("id", documentId)
    throw error
  }
}
