import { updateSession } from "@krafta/supabase/proxy";
import { NextResponse, type NextRequest } from "next/server";
import { normalizeNextPath } from "@/lib/auth/redirect";

export async function proxy(request: NextRequest) {
  const { response: sessionResponse, user } = await updateSession(request);
  const applySessionCookies = (target: NextResponse) => {
    for (const cookie of sessionResponse.cookies.getAll()) {
      target.cookies.set(cookie);
    }
    return target;
  };

  const { pathname } = request.nextUrl;
  const authRoutes = ["/login"];
  const isAuthRoute = authRoutes.some((route) => pathname.startsWith(route));

  if (isAuthRoute && user) {
    const requestOrigin = request.nextUrl.origin;
    const next = normalizeNextPath(
      request.nextUrl.searchParams.get("next"),
      requestOrigin,
      "/",
    );
    const target = new URL(next, request.url);
    return applySessionCookies(NextResponse.redirect(target));
  }

  return sessionResponse;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico).*)",
  ],
};
