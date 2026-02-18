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

  return parseOrigin(process.env.KRAFTA_APP_URL) ?? "http://localhost:3000";
}

export function getAllowedRedirectOrigins(origin: string): string[] {
  const isLocalOrigin =
    origin.includes("localhost") || origin.includes("127.0.0.1");

  const origins = [
    origin,
    process.env.KRAFTA_APP_URL,
    process.env.KRAFTA_PAY_URL,
    process.env.PAY_BASE_URL,
    isLocalOrigin ? "http://localhost:3001" : null,
    isLocalOrigin ? "http://127.0.0.1:3001" : null,
  ]
    .map((value) => parseOrigin(value))
    .filter((value): value is string => Boolean(value));

  return [...new Set(origins)];
}

export function normalizeNextPath(
  next: string | null | undefined,
  origin: string,
  fallback = "/dashboard",
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
