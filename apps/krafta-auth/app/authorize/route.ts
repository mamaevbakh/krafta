import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { randomUUID } from "node:crypto";
import { createSsoAdminClient, normalizeClientNext, sha256Hex } from "@/lib/sso";
import { createClient } from "@/lib/supabase/server";
import { getUserSafely } from "@krafta/supabase/auth";

const AUTH_CODE_TTL_SECONDS = 60;

export async function GET(request: NextRequest) {
  const url = request.nextUrl;
  const clientId = url.searchParams.get("client_id");
  const redirectUri = url.searchParams.get("redirect_uri");
  const responseType = url.searchParams.get("response_type");
  const state = url.searchParams.get("state");
  const codeChallenge = url.searchParams.get("code_challenge");
  const codeChallengeMethod = url.searchParams.get("code_challenge_method");
  const scope = url.searchParams.get("scope") ?? "openid profile email";
  const next = url.searchParams.get("next");

  if (
    !clientId ||
    !redirectUri ||
    !state ||
    !codeChallenge ||
    responseType !== "code" ||
    codeChallengeMethod !== "S256"
  ) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  const supabase = await createClient();
  const { user } = await getUserSafely(supabase);

  if (!user) {
    const loginUrl = new URL("/login", url.origin);
    loginUrl.searchParams.set("next", url.toString());
    return NextResponse.redirect(loginUrl.toString());
  }

  const admin = createSsoAdminClient();
  const { data: clientRow, error: clientError } = await admin
    .from("auth_clients")
    .select("client_id, redirect_uris, is_active")
    .eq("client_id", clientId)
    .maybeSingle();

  if (clientError || !clientRow || !clientRow.is_active) {
    return NextResponse.json({ error: "unauthorized_client" }, { status: 401 });
  }

  const allowedRedirects = (clientRow.redirect_uris ?? []) as string[];
  if (!allowedRedirects.includes(redirectUri)) {
    return NextResponse.json({ error: "invalid_redirect_uri" }, { status: 400 });
  }

  const redirectTargetOrigin = new URL(redirectUri).origin;
  const safeNext = normalizeClientNext(next, redirectTargetOrigin);

  const rawCode = randomUUID().replace(/-/g, "") + randomUUID().replace(/-/g, "");
  const codeHash = sha256Hex(rawCode);
  const expiresAt = new Date(Date.now() + AUTH_CODE_TTL_SECONDS * 1000).toISOString();

  const { error: insertError } = await admin.from("auth_authorization_codes").insert({
    code_hash: codeHash,
    client_id: clientId,
    user_id: user.id,
    redirect_uri: redirectUri,
    code_challenge: codeChallenge,
    challenge_method: "S256",
    scope,
    next_url: safeNext,
    expires_at: expiresAt,
  });

  if (insertError) {
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }

  const redirect = new URL(redirectUri);
  redirect.searchParams.set("code", rawCode);
  redirect.searchParams.set("state", state);
  return NextResponse.redirect(redirect.toString());
}
