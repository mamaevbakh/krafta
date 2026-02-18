type HeaderReader = {
  get(name: string): string | null;
};

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

export function getRequestOrigin(headersList: HeaderReader): string {
  const originFromHeader = parseOrigin(headersList.get("origin"));
  if (originFromHeader) {
    return originFromHeader;
  }

  const host = headersList.get("x-forwarded-host") ?? headersList.get("host");
  if (host) {
    const proto =
      headersList.get("x-forwarded-proto") ??
      (host.includes("localhost") || host.includes("127.0.0.1") ? "http" : "https");
    return `${proto}://${host}`;
  }

  return parseOrigin(process.env.PAY_BASE_URL) ?? "http://localhost:3001";
}

export function normalizePayNext(
  next: string | null | undefined,
  currentOrigin: string,
  fallbackPath = "/dashboard",
): string {
  if (!next) {
    return `${currentOrigin}${fallbackPath}`;
  }

  if (next.startsWith("/") && !next.startsWith("//")) {
    return `${currentOrigin}${next}`;
  }

  try {
    const target = new URL(next);
    if (target.origin === currentOrigin) {
      return target.toString();
    }
  } catch {
    return `${currentOrigin}${fallbackPath}`;
  }

  return `${currentOrigin}${fallbackPath}`;
}

export function getKraftaAppOrigin(): string {
  const appOrigins = [
    ...parseOriginList(process.env.KRAFTA_APP_URLS),
    ...parseOriginList(process.env.NEXT_PUBLIC_KRAFTA_APP_URLS),
  ];

  return (
    parseOrigin(process.env.KRAFTA_APP_URL) ??
    parseOrigin(process.env.NEXT_PUBLIC_KRAFTA_APP_URL) ??
    appOrigins[0] ??
    "http://localhost:3000"
  );
}

export function buildKraftaLoginUrl(next: string): string {
  const base = getKraftaAppOrigin();
  return `${base}/auth/pay-handoff?next=${encodeURIComponent(next)}`;
}
