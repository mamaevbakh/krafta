import Link from "next/link";

import { ArrowUpRight } from "lucide-react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getDocsIndex } from "@/lib/markdoc";

export default async function DocsIndexPage() {
  const docs = await getDocsIndex();

  return (
    <main className="space-y-6">
      <header className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight">Documentation</h1>
        <p className="max-w-2xl text-sm text-muted-foreground md:text-base">
          Product, platform, and integration docs for Krafta.
        </p>
      </header>

      <section className="grid gap-4 md:grid-cols-2">
        {docs.map((doc) => (
          <Card key={doc.href}>
            <CardHeader className="space-y-1">
              <CardTitle className="text-lg">{doc.title}</CardTitle>
              <CardDescription>{doc.description || "No description yet."}</CardDescription>
            </CardHeader>
            <CardContent>
              <Link
                href={doc.href}
                className="inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
              >
                Open page
                <ArrowUpRight className="size-4" />
              </Link>
            </CardContent>
          </Card>
        ))}
      </section>
    </main>
  );
}
