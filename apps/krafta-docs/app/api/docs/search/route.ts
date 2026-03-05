import { NextResponse } from "next/server";

import { getDocBySlug, getDocsIndex, toPlainText } from "@/lib/markdoc";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const query = url.searchParams.get("q")?.trim().toLowerCase();
  if (!query) {
    return NextResponse.json({ query: "", results: [] });
  }

  const docs = await getDocsIndex();
  const matches = await Promise.all(
    docs.map(async (doc) => {
      const docPage = await getDocBySlug(doc.slug);
      if (!docPage) {
        return null;
      }

      const searchableText = `${doc.title}\n${doc.description}\n${toPlainText(docPage.raw)}`.toLowerCase();
      const index = searchableText.indexOf(query);
      if (index === -1) {
        return null;
      }

      const plain = toPlainText(docPage.raw);
      const snippetStart = Math.max(0, index - 80);
      const snippet = plain.slice(snippetStart, snippetStart + 200);

      return {
        href: doc.href,
        slug: doc.slug,
        title: doc.title,
        description: doc.description,
        snippet,
      };
    })
  );

  return NextResponse.json({
    query,
    results: matches.filter(Boolean),
  });
}
