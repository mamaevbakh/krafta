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
export async function proxy(request: NextRequest) {
  const { response: sessionResponse, user } = await updateSession(request);
  const applySessionCookies = (target: NextResponse) => {
    for (const cookie of sessionResponse.cookies.getAll()) {
      target.cookies.set(cookie);
    }
    return target;
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

  return sessionResponse;
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
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|woff2|html)$|api).*)",
  ],
};
