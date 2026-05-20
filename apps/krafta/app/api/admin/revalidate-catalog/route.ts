/**
 * /api/admin/revalidate-catalog — TEMPORARY admin route.
 *
 * One-shot cache buster for the Vercel Data Cache. Merchant-side
 * `updateCatalogByIdAndSlug` uses `updateTag` (Next.js 16 soft revalidation)
 * which doesn't always globally evict the public catalog cache after schema
 * apply / migration drift events. This route calls `revalidateTag(.., "max")`
 * with the high-priority eviction flag so anon visits re-fetch fresh data.
 *
 * Auth: bearer token equal to KRAFTA_SUPABASE_SECRET_KEY (already provisioned
 * in Vercel env vars for both staging and production). No new env var needed.
 *
 * Usage:
 *   curl -H "Authorization: Bearer $KRAFTA_SUPABASE_SECRET_KEY" \
 *     https://krafta-prod-url.vercel.app/api/admin/revalidate-catalog?slug=aladeen
 *
 *   # Or hit all published catalogs at once:
 *   curl -H "Authorization: Bearer $KRAFTA_SUPABASE_SECRET_KEY" \
 *     https://krafta-prod-url.vercel.app/api/admin/revalidate-catalog?all=true
 *
 * REVERT: delete this file after one use. It exists to recover from a
 * one-time stale-cache event after the dev→main migration race on
 * 2026-05-20. Routes like this should not stay in the codebase long-term.
 */

import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { createClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/supabase/types";

export const dynamic = "force-dynamic";

function unauthorized() {
  return new NextResponse("Unauthorized", { status: 401 });
}

function bustTagsForCatalog(catalogId: string, catalogSlug: string) {
  // Mirror every tag the customer-side fetches use (see lib/catalogs/data.ts).
  const tags = [
    `catalog:${catalogId}`,
    `catalog:${catalogSlug}`,
    `catalog-structure:${catalogId}`,
    `catalog-taxes:${catalogId}`,
    `venue:catalog:${catalogId}`,
  ];
  for (const tag of tags) {
    // "max" priority — Next.js 16 forceful global eviction across the Data
    // Cache. Different from `updateTag`, which is per-render soft.
    revalidateTag(tag, "max");
  }
  return tags;
}

export async function GET(request: Request) {
  const auth = request.headers.get("authorization") ?? "";
  const secret =
    process.env.KRAFTA_SUPABASE_SECRET_KEY ??
    process.env.KRAFTA_SUPABASE_SERVICE_ROLE_KEY ??
    "";
  if (!secret || auth !== `Bearer ${secret}`) {
    return unauthorized();
  }

  const supabaseUrl =
    process.env.KRAFTA_SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!supabaseUrl) {
    return NextResponse.json(
      { ok: false, error: "Supabase URL env var missing" },
      { status: 500 },
    );
  }

  const admin = createClient<Database>(supabaseUrl, secret, {
    auth: { persistSession: false },
  });

  const url = new URL(request.url);
  const slug = url.searchParams.get("slug");
  const all = url.searchParams.get("all") === "true";

  let catalogs: Array<{ id: string; slug: string; status: string }> = [];

  if (slug) {
    const { data, error } = await admin
      .from("catalogs")
      .select("id, slug, status")
      .eq("slug", slug)
      .limit(1);
    if (error) {
      return NextResponse.json(
        { ok: false, error: error.message },
        { status: 500 },
      );
    }
    catalogs = (data ?? []) as typeof catalogs;
  } else if (all) {
    const { data, error } = await admin
      .from("catalogs")
      .select("id, slug, status")
      .eq("status", "published");
    if (error) {
      return NextResponse.json(
        { ok: false, error: error.message },
        { status: 500 },
      );
    }
    catalogs = (data ?? []) as typeof catalogs;
  } else {
    return NextResponse.json(
      { ok: false, error: "Pass ?slug=<slug> or ?all=true" },
      { status: 400 },
    );
  }

  if (catalogs.length === 0) {
    return NextResponse.json(
      { ok: false, error: "No matching catalog(s) found" },
      { status: 404 },
    );
  }

  const revalidated: Array<{ slug: string; tags: string[] }> = [];
  for (const catalog of catalogs) {
    const tags = bustTagsForCatalog(catalog.id, catalog.slug);
    revalidated.push({ slug: catalog.slug, tags });
  }

  // Also bust the catalogs list tag so any catalog-listing pages refresh.
  revalidateTag("catalogs", "max");

  return NextResponse.json({
    ok: true,
    revalidated,
    catalogs: catalogs.map((c) => ({ slug: c.slug, status: c.status })),
  });
}
