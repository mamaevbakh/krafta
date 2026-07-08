import { updateSession } from "@krafta/supabase/proxy";
import { NextResponse, type NextRequest } from "next/server";
import { normalizeNextPath } from "@/lib/auth/redirect";
import { hasSsoRuntimeConfig } from "@/lib/auth/sso";

/**
 * Proxy to refresh auth session and protect routes.
 * 
 * This proxy:
 * 1. Refreshes the Supabase auth session on every request
 * 2. Protects /dashboard routes from unauthenticated users
 */
// Retired primary domains — every request 301s to the .uz canonical, path
// preserved. krafta.uz is the primary for the Uzbekistan market; .org and
// .company stay registered forever (brand + QR safety net) but consolidate
// all authority to one domain. dev.krafta.org is deliberately NOT here — it
// keeps serving (for QA), just noindexed below.
const RETIRED_HOSTS = new Set([
  "krafta.org",
  "www.krafta.org",
  "krafta.company",
  "www.krafta.company",
]);

const CANONICAL_HOST = "www.krafta.uz";

export async function proxy(request: NextRequest) {
  const host = request.headers.get("host") ?? "";

  // Domain consolidation first — before any session work, so a redirected
  // request never pays for a Supabase round-trip.
  if (RETIRED_HOSTS.has(host)) {
    const url = request.nextUrl.clone();
    url.protocol = "https:";
    url.host = CANONICAL_HOST;
    url.port = "";
    return NextResponse.redirect(url, 301);
  }

  const { response: sessionResponse, user } = await updateSession(request);

  // Keep non-production hosts out of search indexes. dev.krafta.org (staging)
  // and the raw *.vercel.app deployment URLs serve the same code as prod, so
  // without this they get crawled + indexed as duplicate/stale content (Yandex
  // had indexed dev.krafta.org). This is host-based, not build-based, so the
  // SAME prod deployment is indexable on www.krafta.uz but noindex on its
  // krafta-git-*.vercel.app alias. X-Robots-Tag (not robots.txt disallow) so
  // crawlers can still fetch the page, see the noindex, and drop it.
  const isNonProdHost =
    host.startsWith("dev.") || host.endsWith(".vercel.app");
  const applyIndexingPolicy = (target: NextResponse) => {
    if (isNonProdHost) {
      target.headers.set("X-Robots-Tag", "noindex, nofollow");
    }
    return target;
  };

  const applySessionCookies = (target: NextResponse) => {
    for (const cookie of sessionResponse.cookies.getAll()) {
      target.cookies.set(cookie);
    }
    return applyIndexingPolicy(target);
  };

  const { pathname } = request.nextUrl;

  // Protected routes - require authentication
  const protectedRoutes = ["/dashboard"];
  const isProtectedRoute = protectedRoutes.some((route) =>
    pathname.startsWith(route)
  );

  if (isProtectedRoute && !user) {
    const returnPath = `${pathname}${request.nextUrl.search}`;

    if (hasSsoRuntimeConfig()) {
      const ssoStartUrl = request.nextUrl.clone();
      ssoStartUrl.pathname = "/auth/sso/start";
      ssoStartUrl.searchParams.set("next", returnPath);
      return applySessionCookies(NextResponse.redirect(ssoStartUrl));
    }

    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/login";
    loginUrl.searchParams.set("next", returnPath);
    return applySessionCookies(NextResponse.redirect(loginUrl));
  }

  // Auth routes - redirect to dashboard if already authenticated
  const authRoutes = ["/login"];
  const isAuthRoute = authRoutes.some((route) => pathname.startsWith(route));

  if (isAuthRoute && user) {
    const requestOrigin = request.nextUrl.origin;
    const next = normalizeNextPath(
      request.nextUrl.searchParams.get("next"),
      requestOrigin,
      "/dashboard",
    );
    const target = new URL(next, request.url);
    return applySessionCookies(NextResponse.redirect(target));
  }

  return applyIndexingPolicy(sessionResponse);
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public folder (static assets by extension — incl. .html so
     *   search-console verification files like yandex_*.html are served as
     *   pure static assets, no session/Supabase side-effects on the crawler)
     * - api routes (for webhooks etc)
     * - ingest (PostHog analytics reverse proxy — hot path, skip session work)
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|woff2|html)$|api|ingest).*)",
  ],
};
