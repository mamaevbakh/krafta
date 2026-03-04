import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

function getAllowedOrigins() {
  const values = [
    process.env.KRAFTA_APP_URL,
    process.env.KRAFTA_PAY_URL,
    process.env.AUTH_APP_URL,
    process.env.KRAFTA_ALLOWED_REDIRECT_ORIGINS,
  ]
    .filter(Boolean)
    .flatMap((value) => (value ?? "").split(","))
    .map((item) => item.trim())
    .filter(Boolean);

  return new Set(values.map((value) => {
    try {
      return new URL(value).origin;
    } catch {
      return null;
    }
  }).filter((value): value is string => Boolean(value)));
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  await supabase.auth.signOut();

  let redirectTo: string | null = null;

  try {
    const body = (await request.json()) as { post_logout_redirect_uri?: string };
    const candidate = body.post_logout_redirect_uri;
    if (candidate) {
      const target = new URL(candidate);
      if (getAllowedOrigins().has(target.origin)) {
        redirectTo = candidate;
      }
    }
  } catch {
    // noop
  }

  return NextResponse.json({ ok: true, redirect_to: redirectTo });
}
