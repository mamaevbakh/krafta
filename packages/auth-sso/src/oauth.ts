export type BuildAuthorizeUrlParams = {
  authBaseUrl: string;
  clientId: string;
  redirectUri: string;
  state: string;
  codeChallenge: string;
  scope?: string;
  next?: string;
};

export function buildAuthorizeUrl(params: BuildAuthorizeUrlParams): string {
  const url = new URL("/authorize", params.authBaseUrl);
  url.searchParams.set("client_id", params.clientId);
  url.searchParams.set("redirect_uri", params.redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("state", params.state);
  url.searchParams.set("code_challenge", params.codeChallenge);
  url.searchParams.set("code_challenge_method", "S256");
  url.searchParams.set("scope", params.scope ?? "openid profile email");
  if (params.next) {
    url.searchParams.set("next", params.next);
  }
  return url.toString();
}
