import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  getRequestOrigin,
  normalizeNextPath,
  toAbsoluteRedirectUrl,
} from "@/lib/auth/redirect";
import {
  buildPayHandoffUrl,
  createPayHandoffToken,
} from "@/lib/auth/pay-handoff";

export async function GET(request: NextRequest) {
  const headersList = request.headers;
  const origin = getRequestOrigin(headersList);
  const rawNext = request.nextUrl.searchParams.get("next");
  const normalizedNext = normalizeNextPath(rawNext, origin, "/dashboard");
  const absoluteNext = toAbsoluteRedirectUrl(normalizedNext, origin);

  const supabase = await createClient();
  const [{ data: userData }, { data: sessionData }] = await Promise.all([
    supabase.auth.getUser(),
    supabase.auth.getSession(),
  ]);

  if (!userData.user || !sessionData.session) {
    const loginTarget = `${origin}/login?next=${encodeURIComponent(request.nextUrl.toString())}`;
    return NextResponse.redirect(loginTarget);
  }

  try {
    const handoffUrlBase = buildPayHandoffUrl(absoluteNext);
    const token = createPayHandoffToken({
      accessToken: sessionData.session.access_token,
      refreshToken: sessionData.session.refresh_token,
      next: absoluteNext,
    });

    return NextResponse.redirect(`${handoffUrlBase}?token=${encodeURIComponent(token)}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : "pay_handoff_failed";
    return NextResponse.redirect(`${origin}/login?error=${encodeURIComponent(message)}`);
  }
}
