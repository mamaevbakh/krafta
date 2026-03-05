import { NextResponse } from "next/server";

import { getDocBySlug, toPlainText } from "@/lib/markdoc";

type DocRouteContext = {
  params: Promise<{
    slug: string[];
  }>;
};

export async function GET(_request: Request, { params }: DocRouteContext) {
  const { slug } = await params;
  const doc = await getDocBySlug(slug);

  if (!doc) {
    return NextResponse.json({ error: "Document not found" }, { status: 404 });
  }

  return NextResponse.json({
    slug: doc.slug,
    href: doc.href,
    title: doc.title,
    description: doc.description,
    frontmatter: doc.frontmatter,
    markdown: doc.raw,
    text: toPlainText(doc.raw),
  });
}
