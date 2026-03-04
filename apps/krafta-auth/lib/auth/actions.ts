"use server";

import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { getRequestOrigin, normalizeNextPath } from "@/lib/auth/redirect";

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
      shouldCreateUser: true,
    },
  });

  if (error) {
    return { error: error.message };
  }

  return { success: true };
}

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
