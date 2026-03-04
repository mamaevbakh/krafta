export const SSO_CODE_VERIFIER_COOKIE = "pay_sso_code_verifier";
export const SSO_STATE_COOKIE = "pay_sso_state";
export const SSO_COOKIE_PATH = "/auth/sso";

export function getSsoClientId() {
  return process.env.KRAFTA_PAY_SSO_CLIENT_ID ?? "krafta-pay-web";
}

export function getSsoClientSecret() {
  return process.env.KRAFTA_PAY_SSO_CLIENT_SECRET ?? "";
}

export function getSsoStateSecret() {
  return process.env.KRAFTA_SSO_STATE_SECRET ?? "";
}

export function getSsoAuthBaseUrl() {
  return (
    process.env.KRAFTA_AUTH_URL ??
    process.env.NEXT_PUBLIC_KRAFTA_AUTH_URL ??
    ""
  );
}

export function hasSsoRuntimeConfig() {
  return Boolean(
    getSsoAuthBaseUrl() &&
      getSsoClientId() &&
      getSsoClientSecret() &&
      getSsoStateSecret(),
  );
}
