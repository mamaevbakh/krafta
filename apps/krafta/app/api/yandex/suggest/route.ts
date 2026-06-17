import { NextResponse } from "next/server";

// Server-side proxy for the Yandex Geosuggest API (as-you-type address
// autocomplete). Keeps YANDEX_SUGGEST_KEY off the client. Suggest returns
// address text + a `uri` (no coordinates) — the client resolves the chosen
// uri to coordinates via /api/yandex/geocode?uri=. Biased to Tashkent.
//
// The key is server-side, so we send our own whitelisted domain as Referer
// (YANDEX_REFERER, default dev.krafta.org) rather than the caller's origin —
// one Krafta key then works across localhost, dev, krafta.uz, and custom
// domains. Always 200 with { results: [] } on failure so the search box
// degrades quietly (the map pin + manual form still work).

export async function GET(request: Request) {
  const text = new URL(request.url).searchParams.get("text")?.trim();
  if (!text) return NextResponse.json({ results: [] });

  const key = process.env.YANDEX_SUGGEST_KEY;
  if (!key) return NextResponse.json({ results: [], error: "suggest key not set" });

  const params = new URLSearchParams({
    apikey: key,
    text,
    lang: "ru",
    results: "7",
    print_address: "1",
    attrs: "uri",
    ll: "69.2401,41.2995", // Tashkent center
    spn: "0.7,0.7",
  });

  const referer = process.env.YANDEX_REFERER ?? "https://dev.krafta.org";

  try {
    const res = await fetch(`https://suggest-maps.yandex.ru/v1/suggest?${params.toString()}`, {
      headers: { Referer: referer },
    });
    if (!res.ok) return NextResponse.json({ results: [] });
    const json = (await res.json()) as {
      results?: Array<{
        title?: { text?: string };
        subtitle?: { text?: string };
        uri?: string;
      }>;
    };
    const results = (json.results ?? [])
      .map((it) => ({
        title: it.title?.text ?? "",
        subtitle: it.subtitle?.text ?? null,
        uri: it.uri ?? null,
      }))
      .filter((r): r is { title: string; subtitle: string | null; uri: string } =>
        Boolean(r.uri && r.title),
      );
    return NextResponse.json({ results });
  } catch {
    return NextResponse.json({ results: [] });
  }
}
