import { promises as fs } from "node:fs";
import path from "node:path";

import Markdoc, { type RenderableTreeNode } from "@markdoc/markdoc";

const DOCS_DIR = path.join(process.cwd(), "content", "docs");
const SUPPORTED_EXTENSIONS = [".md", ".mdoc"];

type Frontmatter = {
  title?: string;
  description?: string;
  order?: number;
  group?: string;
};

export type DocsIndexItem = {
  slug: string[];
  href: string;
  title: string;
  description: string;
  order: number;
  group: string;
  filePath: string;
};

export type DocPage = {
  raw: string;
  slug: string[];
  href: string;
  title: string;
  description: string;
  frontmatter: Frontmatter;
  content: RenderableTreeNode;
};

function getSlugFromFilePath(filePath: string): string[] {
  const relativePath = path.relative(DOCS_DIR, filePath);
  const withoutExt = relativePath.replace(/\.(md|mdoc)$/i, "");
  const withoutIndex = withoutExt.replace(/(^|\/)index$/i, "");
  return withoutIndex.split(path.sep).filter(Boolean);
}

function slugToHref(slug: string[]): string {
  return `/docs/${slug.join("/")}`;
}

async function walkDocFiles(dir: string): Promise<string[]> {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const entryPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await walkDocFiles(entryPath)));
      continue;
    }

    if (entry.isFile() && SUPPORTED_EXTENSIONS.some((ext) => entry.name.endsWith(ext))) {
      files.push(entryPath);
    }
  }

  return files;
}

function getFrontmatterAndAst(source: string) {
  const ast = Markdoc.parse(source);
  const frontmatter = parseFrontmatter(ast.attributes.frontmatter);
  return { ast, frontmatter };
}

function parseFrontmatter(input: unknown): Frontmatter {
  if (!input) {
    return {};
  }

  if (typeof input === "object") {
    return input as Frontmatter;
  }

  if (typeof input !== "string") {
    return {};
  }

  const parsed: Record<string, unknown> = {};
  const lines = input
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith("#"));

  for (const line of lines) {
    const match = line.match(/^([A-Za-z0-9_-]+)\s*:\s*(.*)$/);
    if (!match) {
      continue;
    }

    const [, rawKey, rawValue] = match;
    const value = rawValue.trim();
    let parsedValue: unknown = value;

    if (
      (value.startsWith("\"") && value.endsWith("\"")) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      parsedValue = value.slice(1, -1);
    } else if (/^-?\d+$/.test(value)) {
      parsedValue = Number(value);
    } else if (value === "true" || value === "false") {
      parsedValue = value === "true";
    }

    parsed[rawKey] = parsedValue;
  }

  return parsed as Frontmatter;
}

function toDocsIndexItem(filePath: string, source: string): DocsIndexItem {
  const { frontmatter } = getFrontmatterAndAst(source);
  const slug = getSlugFromFilePath(filePath);
  const fallbackTitle = slug.at(-1)?.replace(/[-_]/g, " ") ?? "Untitled";

  return {
    slug,
    href: slugToHref(slug),
    title: frontmatter.title ?? fallbackTitle,
    description: frontmatter.description ?? "",
    order: frontmatter.order ?? 999,
    group: frontmatter.group ?? "General",
    filePath,
  };
}

export async function getDocsIndex(): Promise<DocsIndexItem[]> {
  const docFiles = await walkDocFiles(DOCS_DIR);
  const docs = await Promise.all(
    docFiles.map(async (filePath) => {
      const source = await fs.readFile(filePath, "utf8");
      return toDocsIndexItem(filePath, source);
    })
  );

  return docs.sort((a, b) => {
    if (a.group !== b.group) {
      return a.group.localeCompare(b.group);
    }
    if (a.order !== b.order) {
      return a.order - b.order;
    }
    return a.title.localeCompare(b.title);
  });
}

export async function getDocBySlug(slug: string[]): Promise<DocPage | null> {
  const docs = await getDocsIndex();
  const doc = docs.find((entry) => entry.slug.join("/") === slug.join("/"));
  if (!doc) {
    return null;
  }

  const raw = await fs.readFile(doc.filePath, "utf8");
  const { ast, frontmatter } = getFrontmatterAndAst(raw);
  const content = Markdoc.transform(ast);

  return {
    raw,
    slug: doc.slug,
    href: doc.href,
    title: doc.title,
    description: doc.description,
    frontmatter,
    content,
  };
}

export function toPlainText(markdown: string): string {
  return markdown
    .replace(/^---[\s\S]*?---/m, "")
    .replace(/`{3}[\s\S]*?`{3}/g, " ")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/!\[[^\]]*\]\([^)]+\)/g, " ")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/[#>*_-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
