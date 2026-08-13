/**
 * Query embeddings for retrieval.
 *
 * Must match the ingestion side exactly — text-embedding-3-large truncated to
 * 1536 dims, the same space as `public.catalog_search_documents`. A query
 * embedded with a different model or width does not error; it returns
 * confidently wrong neighbours. Keep this file and lib/knowledge/embed.ts in
 * step.
 */

export const EMBEDDING_MODEL =
  process.env.OPENAI_EMBEDDING_MODEL ?? "text-embedding-3-large"
export const EMBEDDING_DIMENSIONS = Number(
  process.env.OPENAI_EMBEDDING_DIMENSIONS ?? "1536"
)

export async function embedQuery(text: string): Promise<string | null> {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey || !text.trim()) return null

  const response = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: {
      authorization: `Bearer ${apiKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: EMBEDDING_MODEL,
      dimensions: EMBEDDING_DIMENSIONS,
      input: text,
    }),
  })

  // A failed embedding is not a failed search: agent.search_chunks falls back
  // to its keyword arm when the vector is null, which for an exact product
  // name or phone number is often the better arm anyway. Degrade, don't throw.
  if (!response.ok) return null

  const json = (await response.json()) as { data: { embedding: number[] }[] }
  const embedding = json.data?.[0]?.embedding
  return embedding ? `[${embedding.join(",")}]` : null
}
