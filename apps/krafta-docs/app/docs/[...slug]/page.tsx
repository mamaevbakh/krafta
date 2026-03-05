import React from "react";

import Markdoc from "@markdoc/markdoc";
import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { getDocBySlug } from "@/lib/markdoc";

type DocPageProps = {
  params: Promise<{
    slug: string[];
  }>;
};

export async function generateMetadata({ params }: DocPageProps): Promise<Metadata> {
  const { slug } = await params;
  const doc = await getDocBySlug(slug);

  if (!doc) {
    return {
      title: "Not Found | Krafta Docs",
    };
  }

  return {
    title: `${doc.title} | Krafta Docs`,
    description: doc.description,
  };
}

export default async function DocPage({ params }: DocPageProps) {
  const { slug } = await params;
  const doc = await getDocBySlug(slug);
  if (!doc) {
    notFound();
  }

  const rendered = Markdoc.renderers.react(doc.content, React);
  const content =
    React.isValidElement(rendered) && rendered.type === "article"
      ? (rendered.props as { children?: React.ReactNode }).children
      : rendered;

  return (
    <div className="mx-auto w-full max-w-4xl space-y-6">
      <header className="rounded-xl border bg-muted/20 p-5 md:p-6">
        <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
          {doc.frontmatter.group ?? "General"}
        </p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight md:text-4xl">{doc.title}</h1>
        {doc.description ? (
          <p className="mt-3 max-w-3xl text-sm text-muted-foreground md:text-base">
            {doc.description}
          </p>
        ) : null}
      </header>

      <article className="docs-content">
        {content}
      </article>
    </div>
  );
}
