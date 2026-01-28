import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * Auth confirmation handler for:
 * 1. Magic link clicks (token_hash + type)
 * 2. OAuth callbacks (code)
 * 
 * This route exchanges the auth code/token for a session
 * and redirects the user to the appropriate page.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);

  // Get parameters from URL
  const token_hash = searchParams.get("token_hash");
  const type = searchParams.get("type") as
    | "email"
    | "signup"
    | "recovery"
    | "invite"
    | "magiclink"
    | null;
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/dashboard";
  const error = searchParams.get("error");
  const error_description = searchParams.get("error_description");

  // Handle OAuth/PKCE errors
  if (error) {
    console.error("Auth error:", error, error_description);
    return NextResponse.redirect(
      `${origin}/login?error=${encodeURIComponent(error_description || error)}`
    );
  }

  const supabase = await createClient();

  // Handle Magic Link / Email OTP confirmation (token_hash flow)
  if (token_hash && type) {
    const { error: verifyError } = await supabase.auth.verifyOtp({
      token_hash,
      type,
    });

    if (verifyError) {
      console.error("Verify OTP error:", verifyError);
      return NextResponse.redirect(
        `${origin}/login?error=${encodeURIComponent(verifyError.message)}`
      );
    }

    // Successfully verified, redirect to next page
    return NextResponse.redirect(`${origin}${next}`);
  }

  // Handle OAuth callback (PKCE code exchange)
  if (code) {
    const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);

    if (exchangeError) {
      console.error("Exchange code error:", exchangeError);
      return NextResponse.redirect(
        `${origin}/login?error=${encodeURIComponent(exchangeError.message)}`
      );
    }

    // Successfully exchanged, redirect to next page
    return NextResponse.redirect(`${origin}${next}`);
  }

  // No valid parameters provided
  return NextResponse.redirect(`${origin}/login?error=Invalid%20confirmation%20link`);
}
