/**
 * Internal route — invalidate Next.js cache for a catalog.
 *
 * Called by the translate-worker Supabase Edge Function after a batch of
 * translations writes back to translation tables. The customer-facing
 * storefront pages cache aggressively (cacheComponents is on); without
 * busting the catalog tag, AI-translated rows wouldn't appear in the
 * customer view until natural revalidation.
 *
 * Auth: the worker authenticates via the project's service-role key in
 * the Authorization: Bearer header. This route validates the token matches
 * the server-side env var and rejects everything else. No CSRF, no user
 * session — it's a Postgres-to-Next backchannel.
 *
 * Linear: KRA-91 (Slice 2 of KRA-89 epic).
 *
 * Why "internal" path:
 *   /api/internal/* signals "service-role only" routes. NOT exposed via
 *   the Krafta product surface — only callable by trusted backend code
 *   (Supabase Edge Function, future Workflow jobs, etc.).
 */

import { NextRequest, NextResponse } from "next/server";
import { revalidateCatalogByIdAndSlug } from "@/lib/catalogs/revalidate";

// Route handlers don't render anything cache-component-aware; no `dynamic`
// directive needed. The previous `force-static` was incompatible with
// nextConfig.cacheComponents (Next 16 enforces this at build time).

function getServiceRoleKey(): string | null {
  return (
    process.env.KRAFTA_SUPABASE_SECRET_KEY ??
    process.env.KRAFTA_SUPABASE_SERVICE_ROLE_KEY ??
    process.env.SUPABASE_SECRET_KEY ??
    process.env.SUPABASE_SERVICE_ROLE_KEY ??
    null
  );
}

function unauthorized(reason: string) {
  return NextResponse.json({ error: "unauthorized", reason }, { status: 401 });
}

export async function POST(req: NextRequest) {
  // Auth gate.
  const expected = getServiceRoleKey();
  if (!expected) {
    // Env var missing — the route can't authenticate anything. Fail closed.
    return NextResponse.json(
      { error: "server misconfiguration: no service role key" },
      { status: 500 },
    );
  }

  const authHeader = req.headers.get("authorization") ?? "";
  const presented = authHeader.startsWith("Bearer ")
    ? authHeader.slice("Bearer ".length).trim()
    : null;
  if (!presented) return unauthorized("missing Bearer token");

  // Constant-time-ish compare. Token equality check is short-circuit, but
  // these tokens are long enough that timing leaks aren't meaningful at
  // the network level. We're not authenticating users here, just trust.
  if (presented !== expected) {
    return unauthorized("token mismatch");
  }

  // Parse + validate body.
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid json body" }, { status: 400 });
  }
  if (
    !body ||
    typeof body !== "object" ||
    typeof (body as { catalogId?: unknown }).catalogId !== "string"
  ) {
    return NextResponse.json(
      { error: "body.catalogId required (string)" },
      { status: 400 },
    );
  }

  const { catalogId, catalogSlug } = body as {
    catalogId: string;
    catalogSlug?: string;
  };

  await revalidateCatalogByIdAndSlug({
    catalogId,
    catalogSlug: typeof catalogSlug === "string" ? catalogSlug : undefined,
  });

  return NextResponse.json({ ok: true, catalogId });
}
