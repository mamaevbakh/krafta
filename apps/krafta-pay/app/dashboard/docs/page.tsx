import Link from "next/link";
import path from "node:path";
import { readFile } from "node:fs/promises";
import { MarkdownDoc } from "./markdown-doc";
import { cn } from "@/lib/utils";

/**
 * Two audiences, two documents.
 *
 * The API reference is what a merchant integrating Krafta Pay reads, and it is
 * the default — a developer-first product whose docs page opens on internal log
 * taxonomy has buried the thing its users came for. The platform reference
 * stays a click away for operators and support.
 */
const DOCS = {
  api: {
    file: "krafta-pay-api.md",
    label: "API reference",
    title: "Krafta Pay API",
    description: "Integration guide: authentication, customers, subscriptions, webhooks.",
  },
  platform: {
    file: "krafta-pay-platform-reference.md",
    label: "Platform reference",
    title: "Krafta Platform and Krafta Pay Reference",
    description: "Operational reference: provider flows, log event taxonomy, debugging runbooks.",
  },
} as const;

type DocKey = keyof typeof DOCS;

async function loadDocMarkdown(fileName: string) {
  const candidates = [
    path.resolve(process.cwd(), `../../docs/${fileName}`),
    path.resolve(process.cwd(), `docs/${fileName}`),
  ];

  for (const filePath of candidates) {
    try {
      return await readFile(filePath, "utf8");
    } catch {}
  }

  throw new Error("docs_file_not_found");
}

export default async function DashboardDocsPage({
  searchParams,
}: {
  searchParams: Promise<{ doc?: string }>;
}) {
  const sp = await searchParams;
  const active: DocKey = sp.doc === "platform" ? "platform" : "api";
  const doc = DOCS[active];
  const markdown = await loadDocMarkdown(doc.file);

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Documentation</h1>
          <p className="mt-1 text-sm text-muted-foreground">{doc.description}</p>
        </div>
        <Link className="text-sm underline" href="/dashboard">
          Back to Dashboard
        </Link>
      </div>

      <nav className="flex gap-1 border-b" aria-label="Documentation sections">
        {(Object.keys(DOCS) as DocKey[]).map((key) => (
          <Link
            key={key}
            href={`/dashboard/docs?doc=${key}`}
            aria-current={key === active ? "page" : undefined}
            className={cn(
              "-mb-px border-b-2 px-3 py-2 text-sm transition-colors",
              key === active
                ? "border-foreground font-medium text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {DOCS[key].label}
          </Link>
        ))}
      </nav>

      <MarkdownDoc markdown={markdown} title={doc.title} description={doc.description} />
    </div>
  );
}
