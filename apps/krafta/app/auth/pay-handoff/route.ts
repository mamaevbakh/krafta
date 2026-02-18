import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import { getUserSafely } from "@krafta/supabase/auth";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/types";
import {
  getRequestOrigin,
  normalizeNextPath,
  toAbsoluteRedirectUrl,
} from "@/lib/auth/redirect";

function parseOrigin(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}

function parseOriginList(value: string | null | undefined): string[] {
  if (!value) return [];
  return value
    .split(",")
    .map((entry) => parseOrigin(entry.trim()))
    .filter((entry): entry is string => Boolean(entry));
}

function getAllowedPayOrigins() {
  const configured = [
    parseOrigin(process.env.KRAFTA_PAY_URL),
    parseOrigin(process.env.PAY_BASE_URL),
    ...parseOriginList(process.env.KRAFTA_PAY_URLS),
    ...parseOriginList(process.env.PAY_BASE_URLS),
  ].filter((entry): entry is string => Boolean(entry));

  if (!configured.length) {
    return ["http://localhost:3001"];
  }

  return [...new Set(configured)];
}

function isLocalHostname(hostname: string) {
  return hostname === "localhost" || hostname === "127.0.0.1";
}

function isAllowedPayTarget(target: URL, allowedOrigins: string[]) {
  if (allowedOrigins.includes(target.origin)) {
    return true;
  }

  if (!isLocalHostname(target.hostname)) {
    return false;
  }

  // Dev convenience: allow localhost scheme mismatch (http/https) on same host:port.
  return allowedOrigins.some((origin) => {
    try {
      const allowed = new URL(origin);
      return (
        isLocalHostname(allowed.hostname) &&
        allowed.hostname === target.hostname &&
        allowed.port === target.port
      );
    } catch {
      return false;
    }
  });
}

export async function GET(request: NextRequest) {
  const headersList = request.headers;
  const origin = getRequestOrigin(headersList);
  const fail = (message: string) =>
    NextResponse.redirect(`${origin}/login?error=${encodeURIComponent(message)}`);

  const rawNext = request.nextUrl.searchParams.get("next");
  const normalizedNext = normalizeNextPath(rawNext, origin, "/dashboard");
  const absoluteNext = toAbsoluteRedirectUrl(normalizedNext, origin);
  const target = new URL(absoluteNext);

  const payOrigins = getAllowedPayOrigins();
  if (!isAllowedPayTarget(target, payOrigins)) {
    return NextResponse.redirect(absoluteNext);
  }

  const supabase = await createClient();
  const { user, authError: userError } = await getUserSafely(supabase);

  if (userError || !user) {
    const loginTarget = `${origin}/login?next=${encodeURIComponent(request.nextUrl.toString())}`;
    return NextResponse.redirect(loginTarget);
  }

  if (!user.email) {
    return fail("missing_user_email");
  }

  const supabaseUrl =
    process.env.KRAFTA_SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.KRAFTA_SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    return fail("missing_supabase_admin_credentials");
  }

  const admin = createAdminClient<Database>(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });

  const callbackUrl = `${target.origin}/auth/confirm?next=${encodeURIComponent(absoluteNext)}`;

  const { data: linkData, error: linkError } = await admin.auth.admin.generateLink({
    type: "magiclink",
    email: user.email,
    options: {
      redirectTo: callbackUrl,
    },
  });

  if (linkError) {
    return fail(linkError.message || "pay_magiclink_generation_failed");
  }

  const actionLink = linkData.properties?.action_link;
  if (!actionLink) {
    return fail("missing_pay_action_link");
  }

  return NextResponse.redirect(actionLink);
}
