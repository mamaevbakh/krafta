"use server";

import { createClient } from "@/lib/supabase/server";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getRequestOrigin, normalizeNextPath } from "@/lib/auth/redirect";
import { getSsoAuthBaseUrl, hasSsoRuntimeConfig } from "@/lib/auth/sso";
import { getUserSafely } from "@krafta/supabase/auth";

/**
 * Send magic link + OTP code to user's email
 */
export async function signInWithEmail(email: string, next?: string) {
  const supabase = await createClient();
  const headersList = await headers();
  const origin = getRequestOrigin(headersList);
  const resolvedNext = normalizeNextPath(next, origin);

  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo: `${origin}/auth/confirm?next=${encodeURIComponent(
        resolvedNext,
      )}`,
      // Allow new users to sign up automatically
      shouldCreateUser: true,
    },
  });

  if (error) {
    return { error: error.message };
  }

  return { success: true };
}

/**
 * Verify OTP code manually entered by user
 */
export async function verifyOtpCode(email: string, token: string) {
  const supabase = await createClient();

  const { data, error } = await supabase.auth.verifyOtp({
    email,
    token,
    type: "email",
  });

  if (error) {
    return { error: error.message };
  }

  if (data.session) {
    return { success: true };
  }

  return { error: "Verification failed" };
}

/**
 * Sign in with Google OAuth (PKCE flow)
 */
export async function signInWithGoogle(next?: string) {
  const supabase = await createClient();
  const headersList = await headers();
  const origin = getRequestOrigin(headersList);
  const resolvedNext = normalizeNextPath(next, origin);

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: `${origin}/auth/confirm?next=${encodeURIComponent(
        resolvedNext,
      )}`,
      queryParams: {
        access_type: "offline",
        prompt: "consent",
      },
    },
  });

  if (error) {
    return { error: error.message };
  }

  if (data.url) {
    return { url: data.url };
  }

  return { error: "Failed to initiate Google sign in" };
}

/**
 * Sign out
 */
export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();

  // Single logout: when this app federates to the Krafta SSO IdP, the IdP holds
  // its OWN session. Clearing only the local session leaves the IdP logged in,
  // so the next /authorize silently re-issues a code — "I logged out but I'm
  // back in". Bounce through the IdP's logout, which ends its session and
  // returns here. (No SSO configured -> just land on home, as before.)
  if (hasSsoRuntimeConfig()) {
    const origin = getRequestOrigin(await headers());
    const logoutUrl = new URL("/logout", getSsoAuthBaseUrl());
    logoutUrl.searchParams.set("post_logout_redirect_uri", origin);
    redirect(logoutUrl.toString());
  }

  redirect("/");
}

/**
 * Get current user (for server components)
 */
export async function getCurrentUser() {
  const supabase = await createClient();
  const { user } = await getUserSafely(supabase);
  return user;
}
