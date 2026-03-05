---
title: "Getting Started"
description: "How Krafta Docs is structured and how to author new pages with Markdoc."
order: 1
group: "Core"
---

# Getting Started

Krafta Docs is file-based and powered by Markdoc.

## Authoring Model

- All documentation pages live under `content/docs`.
- Each file includes frontmatter for metadata.
- The route path mirrors the file path.

## Add a New Page

1. Create a new markdown file in `content/docs`.
2. Add frontmatter with `title`, `description`, `order`, and `group`.
3. Open the page at `/docs/{slug}`.

## API Endpoints for Agents

- `/api/docs/index` returns the full docs catalog.
- `/api/docs/page/{slug}` returns one page with metadata and markdown text.
- `/api/docs/search?q=...` returns basic full-text matches.
