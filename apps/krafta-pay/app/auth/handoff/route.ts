import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { decodePayHandoffToken } from "@/lib/auth-handoff";
import { getRequestOrigin, normalizePayNext } from "@/lib/auth-redirect";

export async function GET(request: NextRequest) {
  const origin = getRequestOrigin(request.headers);
  const fail = (message: string) =>
    NextResponse.redirect(`${origin}/?error=${encodeURIComponent(message)}`);

  const token = request.nextUrl.searchParams.get("token");
  if (!token) {
    return fail("missing_handoff_token");
  }

  let payload: ReturnType<typeof decodePayHandoffToken>;
  try {
    payload = decodePayHandoffToken(token);
  } catch (error) {
    const message = error instanceof Error ? error.message : "invalid_handoff_token";
    return fail(message);
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.setSession({
    access_token: payload.accessToken,
    refresh_token: payload.refreshToken,
  });

  if (error) {
    return fail(error.message || "handoff_set_session_failed");
  }

  const next = normalizePayNext(payload.next, origin, "/dashboard");
  return NextResponse.redirect(next);
}
