import { NextResponse } from "next/server";

import { getDocsIndex } from "@/lib/markdoc";

export async function GET() {
  const docs = await getDocsIndex();
  return NextResponse.json({
    docs: docs.map((doc) => ({
      slug: doc.slug,
      href: doc.href,
      title: doc.title,
      description: doc.description,
      group: doc.group,
      order: doc.order,
    })),
  });
}
