import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { hasSsoRuntimeConfig } from "@/lib/sso";

export async function GET(request: NextRequest) {
  const { origin, searchParams } = new URL(request.url);
  const next = searchParams.get("next") ?? `${origin}/dashboard`;

  if (hasSsoRuntimeConfig()) {
    const ssoStart = new URL("/auth/sso/start", origin);
    ssoStart.searchParams.set("next", next);
    return NextResponse.redirect(ssoStart.toString());
  }

  return NextResponse.redirect(`${origin}/login?next=${encodeURIComponent(next)}`);
}
