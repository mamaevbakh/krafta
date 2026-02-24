import Link from "next/link";
import path from "node:path";
import { readFile } from "node:fs/promises";
import { MarkdownDoc } from "./markdown-doc";

async function loadDocMarkdown() {
  const candidates = [
    path.resolve(process.cwd(), "../../docs/krafta-pay-platform-reference.md"),
    path.resolve(process.cwd(), "docs/krafta-pay-platform-reference.md"),
  ];

  for (const filePath of candidates) {
    try {
      return await readFile(filePath, "utf8");
    } catch {}
  }

  throw new Error("docs_file_not_found");
}

export default async function DashboardDocsPage() {
  const markdown = await loadDocMarkdown();

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Documentation</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Product and operational reference for Krafta and Krafta Pay, including logs event definitions.
          </p>
        </div>
        <Link className="text-sm underline" href="/dashboard">
          Back to Dashboard
        </Link>
      </div>

      <MarkdownDoc
        markdown={markdown}
        title="Krafta Platform and Krafta Pay Reference"
        description="Versioned markdown documentation rendered inside Krafta Pay dashboard for operators and product development."
      />
    </div>
  );
}

