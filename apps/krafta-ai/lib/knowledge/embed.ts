/**
 * Embeddings for Krafta AI knowledge.
 *
 * The model and dimension are NOT free choices. `agent.doc_chunks.embedding`
 * is `halfvec(1536)` and shares a vector space with the existing
 * `public.catalog_search_documents` corpus: text-embedding-3-large truncated
 * to 1536 dims (Matryoshka). Vectors from a different model or width are not
 * comparable — cosine distance between them is noise, and the failure is
 * silent: search simply returns plausible nonsense. Changing either value
 * means re-embedding every chunk.
 */

export const EMBEDDING_MODEL =
  process.env.OPENAI_EMBEDDING_MODEL ?? "text-embedding-3-large"
export const EMBEDDING_DIMENSIONS = Number(
  process.env.OPENAI_EMBEDDING_DIMENSIONS ?? "1536"
)

/** OpenAI accepts batches; one request per chunk would be slow and rate-limited. */
const BATCH = 96

export async function embedTexts(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return []

  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) throw new Error("missing_openai_api_key")

  const out: number[][] = []

  for (let i = 0; i < texts.length; i += BATCH) {
    const batch = texts.slice(i, i + BATCH)
    const response = await fetch("https://api.openai.com/v1/embeddings", {
      method: "POST",
      headers: {
        authorization: `Bearer ${apiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: EMBEDDING_MODEL,
        dimensions: EMBEDDING_DIMENSIONS,
        input: batch,
      }),
    })

    if (!response.ok) {
      const detail = await response.text().catch(() => "")
      throw new Error(`embedding_failed_${response.status}: ${detail.slice(0, 200)}`)
    }

    const json = (await response.json()) as {
      data: { index: number; embedding: number[] }[]
    }
    // The API does not guarantee order; sort by index before appending or the
    // chunks and their vectors silently swap.
    const ordered = [...json.data].sort((a, b) => a.index - b.index)
    for (const item of ordered) out.push(item.embedding)
  }

  return out
}

/** pgvector's text input format. */
export function toVectorLiteral(embedding: number[]): string {
  return `[${embedding.join(",")}]`
}
