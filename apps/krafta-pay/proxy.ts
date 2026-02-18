import { updateSession } from "@krafta/supabase/proxy";
import { NextResponse, type NextRequest } from "next/server";
import {
  buildKraftaLoginUrl,
  getRequestOrigin,
  normalizePayNext,
} from "@/lib/auth-redirect";

export async function proxy(request: NextRequest) {
  const { response: sessionResponse, user } = await updateSession(request);
  const applySessionCookies = (target: NextResponse) => {
    for (const cookie of sessionResponse.cookies.getAll()) {
      target.cookies.set(cookie);
    }
    return target;
  };

  const { pathname, search } = request.nextUrl;

  if (pathname.startsWith("/dashboard") && !user) {
    const origin = getRequestOrigin(request.headers);
    const payTarget = `${origin}${pathname}${search}`;
    return applySessionCookies(
      NextResponse.redirect(buildKraftaLoginUrl(payTarget)),
    );
  }

  if ((pathname.startsWith("/login") || pathname.startsWith("/signup")) && user) {
    const origin = getRequestOrigin(request.headers);
    const next = normalizePayNext(
      request.nextUrl.searchParams.get("next"),
      origin,
      "/dashboard",
    );
    return applySessionCookies(NextResponse.redirect(next));
  }

  return sessionResponse;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|woff2)$|api).*)",
  ],
};

