import { NextResponse } from "next/server";

// Server-side proxy for the Yandex HTTP Geocoder API (v3 has no built-in
// geocoder). Keeps YANDEX_GEOCODER_KEY off the client. Two modes:
//   ?lng=&lat=   reverse geocode the dropped pin -> address
//   ?uri=        resolve a Geosuggest pick (it returns a uri, not coords)
//
// Yandex's HTTP key restriction matches by Referer. The key is server-side
// (never exposed to the browser), so we send our own whitelisted domain
// (YANDEX_REFERER, default dev.krafta.org) regardless of which merchant
// domain the request actually came from — this keeps one Krafta key working
// across localhost, dev, krafta.uz, and future custom domains. Always 200
// with { address: null } on failure so the picker degrades to coords/manual.

type GeoComponent = { kind?: string; name?: string };

export async function GET(request: Request) {
  const sp = new URL(request.url).searchParams;
  const uri = sp.get("uri");
  const lng = sp.get("lng");
  const lat = sp.get("lat");

  const key = process.env.YANDEX_GEOCODER_KEY;
  if (!key) {
    return NextResponse.json({ address: null, error: "geocoder key not set" });
  }

  const params = new URLSearchParams({
    apikey: key,
    format: "json",
    lang: "ru_RU",
    results: "1",
  });
  if (uri) params.set("uri", uri);
  else if (lng && lat) params.set("geocode", `${lng},${lat}`); // reverse: lon,lat (default sco=longlat)
  else return NextResponse.json({ address: null, error: "need uri or lng+lat" }, { status: 400 });

  const referer = process.env.YANDEX_REFERER ?? "https://dev.krafta.org";

  try {
    const res = await fetch(`https://geocode-maps.yandex.ru/v1/?${params.toString()}`, {
      headers: { Referer: referer },
    });
    if (!res.ok) return NextResponse.json({ address: null });
    const json = (await res.json()) as {
      response?: {
        GeoObjectCollection?: {
          featureMember?: Array<{
            GeoObject?: {
              Point?: { pos?: string };
              metaDataProperty?: {
                GeocoderMetaData?: {
                  text?: string;
                  Address?: { Components?: GeoComponent[] };
                };
              };
            };
          }>;
        };
      };
    };
    const go = json.response?.GeoObjectCollection?.featureMember?.[0]?.GeoObject;
    const meta = go?.metaDataProperty?.GeocoderMetaData;
    if (!meta) return NextResponse.json({ address: null });

    const components = meta.Address?.Components ?? [];
    const byKind = (kind: string) =>
      components.find((c) => c.kind === kind)?.name ?? null;
    // Point.pos is "lon lat" (space-separated).
    const [pLng, pLat] = String(go?.Point?.pos ?? "")
      .split(" ")
      .map((n) => Number(n));

    return NextResponse.json({
      address: {
        freeform: meta.text ?? "",
        district: byKind("district") ?? byKind("area"),
        street: byKind("street"),
        building: byKind("house"),
        latitude: Number.isFinite(pLat) ? pLat : lat ? Number(lat) : null,
        longitude: Number.isFinite(pLng) ? pLng : lng ? Number(lng) : null,
      },
    });
  } catch {
    return NextResponse.json({ address: null });
  }
}
