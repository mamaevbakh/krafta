// app/dashboard/[orgSlug]/[catalogSlug]/categories/page.tsx
//
// 308 permanent redirect to /dashboard/[org]/[catalog]/items/categories
// per ADR 0002 §4.2 (Categories migrates under Items). The Categories page
// itself — UI, server actions, components — moved unchanged to
// `../items/categories/`. This redirect preserves merchants' existing
// bookmarks and the in-app top-nav for one release while the rest of the
// dashboard catches up.
//
// Per the ADR's "Old URLs redirect, no 404s" acceptance criterion.
//
// Lives only in PR 1 of KRA-35; can be deleted in a future release once
// the redirect's expected lifetime (one release) has passed and metrics
// confirm no remaining traffic. Not tied to a feature flag.

import { permanentRedirect } from "next/navigation";

type PageProps = {
  params: Promise<{ orgSlug: string; catalogSlug: string }>;
};

export default async function CategoriesLegacyRedirectPage({
  params,
}: PageProps) {
  const { orgSlug, catalogSlug } = await params;
  permanentRedirect(`/dashboard/${orgSlug}/${catalogSlug}/items/categories`);
}
