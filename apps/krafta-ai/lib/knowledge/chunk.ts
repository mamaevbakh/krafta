/**
 * Splits a document into retrievable chunks.
 *
 * Paragraph-aware rather than fixed-width: a chunk that ends mid-sentence
 * retrieves badly and quotes worse, and this text gets shown to a customer as
 * a citation. Paragraphs are the natural unit of a menu, a price list or a
 * policy document, which is what merchants actually upload.
 *
 * Overlap exists because the answer is often at a boundary — "delivery is free
 * over 100 000" in one paragraph, "within these districts" in the next. Losing
 * that seam is how an agent gives a confidently half-right answer.
 */

const TARGET = 900
const MAX = 1400
const OVERLAP = 150

export type Chunk = { index: number; content: string }

export function chunkText(input: string): Chunk[] {
  const text = input.replace(/\r\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim()
  if (!text) return []

  const paragraphs = text.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean)
  const chunks: string[] = []
  let current = ""

  for (const para of paragraphs) {
    // A single paragraph longer than MAX is usually a wall of text with no
    // blank lines (a PDF export). Break it on sentence ends so we still cut
    // somewhere a human would.
    if (para.length > MAX) {
      if (current) {
        chunks.push(current)
        current = ""
      }
      for (const piece of splitLongParagraph(para)) chunks.push(piece)
      continue
    }

    if (current && current.length + para.length + 2 > TARGET) {
      chunks.push(current)
      current = tailOverlap(current)
    }
    current = current ? `${current}\n\n${para}` : para
  }
  if (current.trim()) chunks.push(current)

  return chunks
    .map((c) => c.trim())
    .filter((c) => c.length > 0)
    .map((content, index) => ({ index, content }))
}

function splitLongParagraph(para: string): string[] {
  const sentences = para.match(/[^.!?…]+[.!?…]+\s*|[^.!?…]+$/g) ?? [para]
  const out: string[] = []
  let buf = ""
  for (const s of sentences) {
    if (buf && buf.length + s.length > TARGET) {
      out.push(buf.trim())
      buf = tailOverlap(buf)
    }
    buf += s
  }
  if (buf.trim()) out.push(buf.trim())
  return out
}

/** Carry the last whole sentence forward so a boundary fact isn't orphaned. */
function tailOverlap(text: string): string {
  const tail = text.slice(-OVERLAP)
  const cut = tail.search(/[.!?…]\s/)
  return cut === -1 ? "" : tail.slice(cut + 1).trim() + " "
}
