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

  return parseOrigin(process.env.AUTH_APP_URL) ?? "http://localhost:3002";
}

export function getAllowedRedirectOrigins(origin: string): string[] {
  const isLocalOrigin =
    origin.includes("localhost") || origin.includes("127.0.0.1");

  const extraOrigins = [
    ...parseOriginList(process.env.KRAFTA_ALLOWED_REDIRECT_ORIGINS),
    ...parseOriginList(process.env.KRAFTA_APP_URLS),
    ...parseOriginList(process.env.KRAFTA_PAY_URLS),
  ];

  const origins = [
    origin,
    process.env.AUTH_APP_URL,
    process.env.KRAFTA_APP_URL,
    process.env.KRAFTA_PAY_URL,
    ...extraOrigins,
    isLocalOrigin ? "http://localhost:3000" : null,
    isLocalOrigin ? "http://localhost:3001" : null,
  ]
    .map((value) => parseOrigin(value))
    .filter((value): value is string => Boolean(value));

  return [...new Set(origins)];
}

export function normalizeNextPath(
  next: string | null | undefined,
  origin: string,
  fallback = "/",
): string {
  if (!next) return fallback;

  if (next.startsWith("/") && !next.startsWith("//")) {
    return next;
  }

  try {
    const target = new URL(next);
    if (!getAllowedRedirectOrigins(origin).includes(target.origin)) {
      return fallback;
    }
    return target.toString();
  } catch {
    return fallback;
  }
}

export function toAbsoluteRedirectUrl(target: string, origin: string): string {
  if (target.startsWith("http://") || target.startsWith("https://")) {
    return target;
  }
  return `${origin}${target}`;
}
