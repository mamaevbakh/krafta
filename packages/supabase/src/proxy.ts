import { createServerClient } from "@supabase/ssr";
import type { User } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import type { Database } from "./database.types";
import { getUserSafely } from "./auth";

const AUTH_COOKIE_MARKER = "-auth-token";
const PKCE_CODE_VERIFIER_MARKER = "-auth-token-code-verifier";

function isSupabaseAuthCookie(name: string) {
  if (!name.startsWith("sb-")) return false;
  if (name.includes(PKCE_CODE_VERIFIER_MARKER)) return false;
  return name.includes(AUTH_COOKIE_MARKER);
}

function clearSupabaseAuthCookies(request: NextRequest, response: NextResponse) {
  for (const cookie of request.cookies.getAll()) {
    if (!isSupabaseAuthCookie(cookie.name)) continue;
    request.cookies.delete(cookie.name);
    response.cookies.delete(cookie.name);
  }
}

export async function updateSession(
  request: NextRequest,
  params?: {
    supabaseUrl?: string;
    supabaseAnonKey?: string;
  },
) {
  const supabaseUrl = params?.supabaseUrl ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey =
    params?.supabaseAnonKey ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error("missing_supabase_env_for_proxy");
  }

  let response = NextResponse.next({ request });
  const supabase = createServerClient<Database>(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        for (const { name, value } of cookiesToSet) {
          request.cookies.set(name, value);
        }

        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options);
        }
      },
    },
  });

  const { user, authError, refreshTokenMissing } = await getUserSafely<User>(supabase);

  if (refreshTokenMissing) {
    clearSupabaseAuthCookies(request, response);
    return { response, user: null, authError: null } as const;
  }

  if (user) {
    return { response, user, authError: null } as const;
  }

  if (!authError) {
    return { response, user: null, authError: null } as const;
  }

  return { response, user: null, authError } as const;
}
