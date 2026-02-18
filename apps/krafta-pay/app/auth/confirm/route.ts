import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { normalizePayNext } from "@/lib/auth-redirect";

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);

  const token_hash = searchParams.get("token_hash");
  const type = searchParams.get("type") as
    | "email"
    | "signup"
    | "recovery"
    | "invite"
    | "magiclink"
    | null;
  const code = searchParams.get("code");
  const next = normalizePayNext(searchParams.get("next"), origin, "/dashboard");
  const error = searchParams.get("error");
  const errorDescription = searchParams.get("error_description");

  if (error) {
    return NextResponse.redirect(
      `${origin}/?error=${encodeURIComponent(errorDescription || error)}`,
    );
  }

  const supabase = await createClient();

  if (token_hash && type) {
    const { error: verifyError } = await supabase.auth.verifyOtp({
      token_hash,
      type,
    });

    if (verifyError) {
      return NextResponse.redirect(
        `${origin}/?error=${encodeURIComponent(verifyError.message)}`,
      );
    }

    return NextResponse.redirect(next);
  }

  if (code) {
    const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);

    if (exchangeError) {
      return NextResponse.redirect(
        `${origin}/?error=${encodeURIComponent(exchangeError.message)}`,
      );
    }

    return NextResponse.redirect(next);
  }

  return NextResponse.redirect(`${origin}/?error=Invalid%20confirmation%20link`);
}

