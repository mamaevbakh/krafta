import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import {
  createSsoAdminClient,
  secureCompareHex,
  secureCompareText,
  sha256Base64Url,
  sha256Hex,
} from "@/lib/sso";

type TokenRequest = {
  grant_type?: string;
  code?: string;
  redirect_uri?: string;
  code_verifier?: string;
  client_id?: string;
  client_secret?: string;
};

async function parseBody(request: NextRequest): Promise<TokenRequest> {
  const contentType = request.headers.get("content-type") ?? "";

  if (contentType.includes("application/json")) {
    return (await request.json()) as TokenRequest;
  }

  const form = await request.formData();
  return {
    grant_type: form.get("grant_type")?.toString(),
    code: form.get("code")?.toString(),
    redirect_uri: form.get("redirect_uri")?.toString(),
    code_verifier: form.get("code_verifier")?.toString(),
    client_id: form.get("client_id")?.toString(),
    client_secret: form.get("client_secret")?.toString(),
  };
}

export async function POST(request: NextRequest) {
  const body = await parseBody(request);

  if (
    body.grant_type !== "authorization_code" ||
    !body.code ||
    !body.redirect_uri ||
    !body.code_verifier ||
    !body.client_id ||
    !body.client_secret
  ) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  const admin = createSsoAdminClient();

  const { data: clientRow, error: clientError } = await admin
    .from("auth_clients")
    .select("client_id, redirect_uris, secret_hash, is_active")
    .eq("client_id", body.client_id)
    .maybeSingle();

  if (clientError || !clientRow || !clientRow.is_active) {
    return NextResponse.json({ error: "unauthorized_client" }, { status: 401 });
  }

  const allowedRedirects = (clientRow.redirect_uris ?? []) as string[];
  if (!allowedRedirects.includes(body.redirect_uri)) {
    return NextResponse.json({ error: "invalid_redirect_uri" }, { status: 400 });
  }

  const providedSecretHash = sha256Hex(body.client_secret);
  if (!secureCompareHex(providedSecretHash, clientRow.secret_hash)) {
    return NextResponse.json({ error: "invalid_client" }, { status: 401 });
  }

  const incomingCodeHash = sha256Hex(body.code);
  const { data: codeRow, error: codeError } = await admin
    .from("auth_authorization_codes")
    .select("id, user_id, redirect_uri, code_challenge, challenge_method, expires_at, consumed_at, next_url")
    .eq("client_id", body.client_id)
    .eq("code_hash", incomingCodeHash)
    .maybeSingle();

  if (codeError || !codeRow) {
    return NextResponse.json({ error: "invalid_grant" }, { status: 400 });
  }

  if (codeRow.redirect_uri !== body.redirect_uri) {
    return NextResponse.json({ error: "invalid_grant" }, { status: 400 });
  }

  if (codeRow.consumed_at) {
    return NextResponse.json({ error: "invalid_grant" }, { status: 400 });
  }

  if (new Date(codeRow.expires_at).getTime() <= Date.now()) {
    return NextResponse.json({ error: "invalid_grant" }, { status: 400 });
  }

  const verifierChallenge = sha256Base64Url(body.code_verifier);
  if (
    codeRow.challenge_method !== "S256" ||
    !secureCompareText(verifierChallenge, codeRow.code_challenge)
  ) {
    return NextResponse.json({ error: "invalid_grant" }, { status: 400 });
  }

  const { data: consumedRows, error: consumeError } = await admin
    .from("auth_authorization_codes")
    .update({ consumed_at: new Date().toISOString() })
    .eq("id", codeRow.id)
    .is("consumed_at", null)
    .select("id");

  if (consumeError || !consumedRows?.length) {
    return NextResponse.json({ error: "invalid_grant" }, { status: 400 });
  }

  const { data: userData, error: userError } = await admin.auth.admin.getUserById(codeRow.user_id);
  const userEmail = userData.user?.email;
  if (userError || !userEmail) {
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }

  const redirectTarget = new URL(codeRow.redirect_uri);
  const nextUrl = codeRow.next_url ?? `${redirectTarget.origin}/dashboard`;
  const callbackUrl = `${redirectTarget.origin}/auth/confirm?next=${encodeURIComponent(nextUrl)}`;

  const { data: linkData, error: linkError } = await admin.auth.admin.generateLink({
    type: "magiclink",
    email: userEmail,
    options: {
      redirectTo: callbackUrl,
    },
  });

  if (linkError) {
    return NextResponse.json({ error: "server_error", error_description: linkError.message }, { status: 500 });
  }

  const tokenHash = linkData.properties?.hashed_token;
  const verificationType = linkData.properties?.verification_type ?? "magiclink";

  const handoffUrl = tokenHash
    ? `${redirectTarget.origin}/auth/confirm?token_hash=${encodeURIComponent(tokenHash)}&type=${encodeURIComponent(verificationType)}&next=${encodeURIComponent(nextUrl)}`
    : linkData.properties?.action_link;

  if (!handoffUrl) {
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }

  return NextResponse.json({
    token_type: "handoff",
    expires_in: 60,
    handoff_redirect_url: handoffUrl,
  });
}
