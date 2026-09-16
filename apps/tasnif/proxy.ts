import { NextResponse, type NextRequest } from "next/server"

import { DEFAULT_LOCALE, LOCALE_COOKIE, isLocale, type Locale } from "@/lib/i18n"

/**
 * Next 16 renamed middleware: this file is `proxy.ts` exporting `proxy()`.
 *
 * One job: every page lives under /ru, /uz or /en, so a visitor who arrives
 * without one is sent to the language they chose before (cookie), else the
 * first supported language their browser asks for, else Russian. API routes
 * and static files never pass through here.
 */
function preferredLocale(request: NextRequest): Locale {
  const saved = request.cookies.get(LOCALE_COOKIE)?.value
  if (isLocale(saved)) return saved
  for (const part of (request.headers.get("accept-language") ?? "").split(",")) {
    const language = part.split(";")[0].trim().toLowerCase().split("-")[0]
    if (isLocale(language)) return language
  }
  return DEFAULT_LOCALE
}

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl
  if (isLocale(pathname.split("/")[1])) return NextResponse.next()

  // Browsers ask for /favicon.ico whatever the page declares. Without this it
  // would land in app/[locale] as a locale named "favicon.ico", which Cache
  // Components reports as runtime data during prerendering.
  if (pathname === "/favicon.ico") {
    return NextResponse.rewrite(new URL("/icon.svg", request.url))
  }

  const destination = request.nextUrl.clone()
  destination.pathname = `/${preferredLocale(request)}${pathname === "/" ? "" : pathname}`
  return NextResponse.redirect(destination)
}

export const config = {
  matcher: ["/favicon.ico", "/((?!api|_next|.*\\..*).*)"],
}
