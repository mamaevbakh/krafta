"use client";

// Yandex Maps JS API v3 (ymaps3) address picker — the "set location on map"
// screen used by leading delivery apps (Yandex Go, Uber, Glovo, Bolt): a FIXED
// pin welded to the viewport centre while the customer drags the MAP underneath.
// The map centre is the source of truth; we reverse-geocode it when the map
// settles (debounced) and report a live candidate up to the confirm sheet.
//
// v3 has NO built-in geocoder/suggest, so resolution goes through our server
// proxy (/api/yandex/geocode, /api/yandex/suggest) holding the keys server-side.
// The MAP itself loads with the public JS key (NEXT_PUBLIC_YANDEX_MAPS_API_KEY).
//
// COORDINATES IN v3 ARE [longitude, latitude] (GeoJSON order).

import { useCallback, useEffect, useRef, useState } from "react";
import { Crosshair, Loader2, MapPin, Search } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useStorefrontLocale } from "@/lib/catalogs/storefront-locale-context";
import { getStorefrontMessage } from "@/lib/locales/messages";
import { cn } from "@/lib/utils";

export type PickedAddress = {
  freeform: string;
  district: string | null;
  street: string | null;
  building: string | null;
  latitude: number;
  longitude: number;
};

type Suggestion = { title: string; subtitle: string | null; uri: string };

// [lng, lat] — v3 is longitude-first.
const TASHKENT_CENTER: [number, number] = [69.2401, 41.2995];

const YMAPS_KEY = process.env.NEXT_PUBLIC_YANDEX_MAPS_API_KEY ?? "";

/* eslint-disable @typescript-eslint/no-explicit-any */
type Ymaps3 = any;

let ymapsPromise: Promise<Ymaps3> | null = null;

/** Load + ready the Yandex Maps v3 global exactly once per page. */
function loadYmaps3(): Promise<Ymaps3> {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("Yandex Maps needs a browser."));
  }
  const w = window as any;
  if (w.ymaps3?.ready) return w.ymaps3.ready.then(() => w.ymaps3);
  if (ymapsPromise) return ymapsPromise;
  if (!YMAPS_KEY) return Promise.reject(new Error("Yandex Maps key is not set."));

  ymapsPromise = new Promise<Ymaps3>((resolve, reject) => {
    const onReady = async () => {
      try {
        await w.ymaps3.ready;
        resolve(w.ymaps3);
      } catch (err) {
        reject(err instanceof Error ? err : new Error("Yandex Maps failed."));
      }
    };
    const fail = () => {
      ymapsPromise = null;
      reject(new Error("Yandex Maps script failed to load."));
    };
    const existing = document.querySelector<HTMLScriptElement>("script[data-ymaps3]");
    if (existing) {
      if (w.ymaps3) onReady();
      else existing.addEventListener("load", onReady);
      existing.addEventListener("error", fail);
      return;
    }
    const script = document.createElement("script");
    script.src = `https://api-maps.yandex.ru/v3/?apikey=${encodeURIComponent(YMAPS_KEY)}&lang=ru_RU`;
    script.async = true;
    script.dataset.ymaps3 = "1";
    script.addEventListener("load", onReady);
    script.addEventListener("error", fail);
    document.head.appendChild(script);
  });
  return ymapsPromise;
}

function coordsFallback(c: [number, number]): PickedAddress {
  return {
    freeform: `${c[1].toFixed(5)}, ${c[0].toFixed(5)}`,
    district: null,
    street: null,
    building: null,
    latitude: c[1],
    longitude: c[0],
  };
}

function isDark(): boolean {
  return (
    typeof document !== "undefined" &&
    document.documentElement.classList.contains("dark")
  );
}

// A polygon ring approximating a circle of `radiusM` around [lng, lat]. The
// equirectangular metres→degrees conversion is exact enough at city scale for a
// delivery-zone overlay (we're drawing a hint, not measuring).
function ringAround(
  center: [number, number],
  radiusM: number,
  points = 64,
): [number, number][] {
  const [lng, lat] = center;
  const dLat = radiusM / 111_320;
  const dLng = radiusM / (111_320 * Math.cos((lat * Math.PI) / 180) || 1);
  const ring: [number, number][] = [];
  for (let i = 0; i <= points; i++) {
    const a = (i / points) * 2 * Math.PI;
    ring.push([lng + dLng * Math.cos(a), lat + dLat * Math.sin(a)]);
  }
  return ring;
}

// Mono zone styling that tracks the app theme, matching the foreground pin.
function circleStyle(dark: boolean) {
  const base = dark ? "235,235,240" : "24,24,27";
  return {
    stroke: [{ color: `rgba(${base},0.7)`, width: 2 }],
    fill: `rgba(${base},0.08)`,
  };
}

export function AddressMapPicker({
  initial,
  onChange,
  onResolvingChange,
  onLoadError,
  autoLocate,
  searchPlaceholder,
  radiusM,
  className,
}: {
  initial?: { latitude: number | null; longitude: number | null } | null;
  /** Fires with the reverse-geocoded candidate every time the map settles. */
  onChange: (address: PickedAddress) => void;
  /** True while a pan is in flight / the geocode is resolving — drives the
   *  confirm sheet's skeleton. */
  onResolvingChange?: (resolving: boolean) => void;
  onLoadError?: (message: string) => void;
  /** Trigger device geolocation once on mount (the "use my location" entry). */
  autoLocate?: boolean;
  searchPlaceholder?: string;
  /** When set (>0), draws a translucent delivery-zone circle of this radius
   *  (metres) centred on the map centre. The dashboard origin picker passes it;
   *  the customer address picker omits it (no circle). */
  radiusM?: number | null;
  className?: string;
}) {
  const { activeLocale, defaultLocale } = useStorefrontLocale();
  const t = (key: Parameters<typeof getStorefrontMessage>[0]) =>
    getStorefrontMessage(key, { activeLocale, defaultLocale });
  const hostRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<any>(null);
  const centerRef = useRef<[number, number]>(TASHKENT_CENTER);
  // Set while a programmatic fly-to is animating so its action events don't
  // double-fire the reverse-geocode (the caller resolves the address itself).
  const ignoreActionRef = useRef(false);
  const geocodeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Optional delivery-zone circle (dashboard origin picker). The map centre is
  // the zone origin; the ring is redrawn as the map pans / the radius changes.
  const ymapsRef = useRef<any>(null);
  const circleRef = useRef<any>(null);
  const radiusRef = useRef<number | null>(radiusM ?? null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [panning, setPanning] = useState(false);
  const [locating, setLocating] = useState(false);
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [resolving, setResolving] = useState(false);
  const suggestDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  const setResolvingBoth = useCallback(
    (v: boolean) => {
      setResolving(v);
      onResolvingChange?.(v);
    },
    [onResolvingChange],
  );

  // Reverse-geocode the given (or current) centre, debounced so a flurry of
  // pan events collapses to one request after the map stops.
  const reverseGeocode = useCallback(
    (c: [number, number]) => {
      setResolvingBoth(true);
      if (geocodeTimer.current) clearTimeout(geocodeTimer.current);
      geocodeTimer.current = setTimeout(async () => {
        try {
          const res = await fetch(`/api/yandex/geocode?lng=${c[0]}&lat=${c[1]}`);
          const json = (await res.json()) as { address: PickedAddress | null };
          onChange(
            json.address
              ? { ...json.address, latitude: c[1], longitude: c[0] }
              : coordsFallback(c),
          );
        } catch {
          onChange(coordsFallback(c));
        } finally {
          setResolvingBoth(false);
        }
      }, 320);
    },
    [onChange, setResolvingBoth],
  );

  const readCenter = useCallback((): [number, number] => {
    const c = mapRef.current?.center as [number, number] | undefined;
    return Array.isArray(c) && c.length === 2 ? c : centerRef.current;
  }, []);

  /** Animate the map to a new centre without the action listener re-geocoding
   *  (the caller owns the resulting address). */
  const flyTo = useCallback((c: [number, number], zoom = 17) => {
    ignoreActionRef.current = true;
    centerRef.current = c;
    mapRef.current?.update?.({ location: { center: c, zoom, duration: 400 } });
  }, []);

  const runGeolocation = useCallback(() => {
    if (!navigator.geolocation) return;
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false);
        const c: [number, number] = [pos.coords.longitude, pos.coords.latitude];
        flyTo(c, 17);
        reverseGeocode(c);
      },
      () => setLocating(false),
      { enableHighAccuracy: true, timeout: 10_000 },
    );
  }, [flyTo, reverseGeocode]);

  // Keep the latest radius in a ref so the (stable) map listeners can redraw
  // the zone ring without re-subscribing.
  useEffect(() => {
    radiusRef.current = radiusM ?? null;
  }, [radiusM]);

  // Create/update the translucent delivery-zone circle centred on `center`.
  // No-op (and tears the ring down) unless a positive radius was provided.
  const drawCircle = useCallback((center: [number, number]) => {
    const ymaps3 = ymapsRef.current;
    const r = radiusRef.current;
    if (!ymaps3 || !mapRef.current) return;
    if (!r || r <= 0) {
      if (circleRef.current) {
        try {
          mapRef.current.removeChild(circleRef.current);
        } catch {
          // already detached
        }
        circleRef.current = null;
      }
      return;
    }
    const geometry = {
      type: "Polygon" as const,
      coordinates: [ringAround(center, r)],
    };
    const style = circleStyle(isDark());
    if (circleRef.current) {
      circleRef.current.update({ geometry, style });
    } else {
      circleRef.current = new ymaps3.YMapFeature({ geometry, style });
      mapRef.current.addChild(circleRef.current);
    }
  }, []);

  // Redraw when the radius changes (e.g. the merchant drags the slider).
  useEffect(() => {
    if (status === "ready") drawCircle(readCenter());
  }, [radiusM, status, drawCircle, readCenter]);

  // Mount the map once v3 is ready.
  useEffect(() => {
    let disposed = false;
    let themeObserver: MutationObserver | null = null;
    loadYmaps3()
      .then((ymaps3) => {
        if (disposed || !hostRef.current) return;
        ymapsRef.current = ymaps3;
        const {
          YMap,
          YMapDefaultSchemeLayer,
          YMapDefaultFeaturesLayer,
          YMapListener,
        } = ymaps3;
        const start: [number, number] =
          initial?.latitude != null && initial?.longitude != null
            ? [initial.longitude, initial.latitude]
            : TASHKENT_CENTER;
        centerRef.current = start;

        const map = new YMap(hostRef.current, {
          location: { center: start, zoom: 16 },
          theme: isDark() ? "dark" : "light",
        });
        map.addChild(new YMapDefaultSchemeLayer({}));
        map.addChild(new YMapDefaultFeaturesLayer({}));

        // Fixed-centre-pin model: no marker. We watch the map's own action
        // events and reverse-geocode the centre when it settles. onUpdate keeps
        // a live centre ref so readCenter() works even if `.center` is absent.
        map.addChild(
          new YMapListener({
            onUpdate: (e: any) => {
              const c = e?.location?.center;
              if (Array.isArray(c) && c.length === 2) {
                centerRef.current = c as [number, number];
                drawCircle(c as [number, number]);
              }
            },
            onActionStart: () => {
              if (ignoreActionRef.current) return;
              setPanning(true);
              setResolvingBoth(true);
            },
            onActionEnd: () => {
              if (ignoreActionRef.current) {
                ignoreActionRef.current = false;
                return;
              }
              setPanning(false);
              reverseGeocode(readCenter());
            },
          }),
        );

        mapRef.current = map;

        // Keep the vector map in sync with the app light/dark theme.
        themeObserver = new MutationObserver(() => {
          mapRef.current?.update?.({ theme: isDark() ? "dark" : "light" });
          if (circleRef.current) {
            circleRef.current.update({ style: circleStyle(isDark()) });
          }
        });
        themeObserver.observe(document.documentElement, {
          attributes: true,
          attributeFilter: ["class"],
        });

        setStatus("ready");
        if (autoLocate) runGeolocation();
        else reverseGeocode(start);
      })
      .catch((err: unknown) => {
        if (disposed) return;
        setStatus("error");
        onLoadError?.(err instanceof Error ? err.message : "Map unavailable.");
      });

    return () => {
      disposed = true;
      themeObserver?.disconnect();
      if (geocodeTimer.current) clearTimeout(geocodeTimer.current);
      try {
        mapRef.current?.destroy?.();
      } catch {
        // already torn down
      }
      mapRef.current = null;
    };
    // initial / autoLocate read once on mount on purpose.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Debounced autocomplete.
  const onQueryChange = useCallback((value: string) => {
    setQuery(value);
    if (suggestDebounce.current) clearTimeout(suggestDebounce.current);
    const text = value.trim();
    if (text.length < 3) {
      setSuggestions([]);
      return;
    }
    suggestDebounce.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/yandex/suggest?text=${encodeURIComponent(text)}`);
        const json = (await res.json()) as { results: Suggestion[] };
        setSuggestions(json.results ?? []);
      } catch {
        setSuggestions([]);
      }
    }, 250);
  }, []);

  // Resolve a chosen suggestion (uri -> coords + address) then fly the map there
  // so the customer can nudge to the exact entrance.
  const pickSuggestion = useCallback(
    async (s: Suggestion) => {
      setQuery(s.title);
      setSuggestions([]);
      setResolvingBoth(true);
      try {
        const res = await fetch(`/api/yandex/geocode?uri=${encodeURIComponent(s.uri)}`);
        const json = (await res.json()) as { address: PickedAddress | null };
        if (json.address?.latitude != null && json.address?.longitude != null) {
          flyTo([json.address.longitude, json.address.latitude]);
          onChange(json.address);
        }
      } catch {
        // leave the map where it is
      } finally {
        setResolvingBoth(false);
      }
    },
    [flyTo, onChange, setResolvingBoth],
  );

  if (status === "error") return null;

  return (
    <div className={cn("relative h-full w-full overflow-hidden", className)}>
      <div ref={hostRef} className="absolute inset-0" />

      {/* Fixed centre pin (the geocode point). Lifts on pan; a ground dot marks
          the exact spot. Mono, theme-aware, no decorative shadow. */}
      <div
        aria-hidden
        className={cn(
          "pointer-events-none absolute left-1/2 top-1/2 z-20 -translate-x-1/2 transition-transform duration-150 ease-out",
          panning ? "-translate-y-[calc(100%+8px)]" : "-translate-y-full",
        )}
      >
        <MapPin className="size-9 fill-foreground text-background" strokeWidth={1.5} />
      </div>
      <div
        aria-hidden
        className={cn(
          "pointer-events-none absolute left-1/2 top-1/2 z-10 -translate-x-1/2 -translate-y-1/2 rounded-full bg-foreground/30 transition-all duration-150",
          panning ? "size-1.5" : "size-2.5",
        )}
      />

      {/* Search, pinned over the map. */}
      <div className="absolute inset-x-3 top-3 z-30">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            placeholder={searchPlaceholder ?? t("address.search")}
            className="bg-background pl-9 shadow-sm"
            aria-label={searchPlaceholder ?? t("address.search")}
            autoComplete="off"
          />
        </div>
        {suggestions.length > 0 ? (
          <ul className="mt-1 max-h-56 overflow-y-auto rounded-md border bg-popover p-1 shadow-md">
            {suggestions.map((s) => (
              <li key={s.uri}>
                <button
                  type="button"
                  onClick={() => void pickSuggestion(s)}
                  className="flex w-full items-start gap-2 rounded-md px-2 py-2 text-left text-sm hover:bg-accent"
                >
                  <MapPin className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
                  <span className="min-w-0">
                    <span className="block truncate font-medium">{s.title}</span>
                    {s.subtitle ? (
                      <span className="block truncate text-xs text-muted-foreground">
                        {s.subtitle}
                      </span>
                    ) : null}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </div>

      {/* Locate FAB, bottom-right, 44px. */}
      <Button
        type="button"
        variant="outline"
        size="icon"
        onClick={runGeolocation}
        disabled={locating}
        aria-label={t("address.use_location")}
        className="absolute bottom-4 right-4 z-30 size-11 rounded-full bg-background shadow-sm"
      >
        {locating ? (
          <Loader2 className="size-5 animate-spin" />
        ) : (
          <Crosshair className="size-5" />
        )}
      </Button>

      {status === "loading" ? (
        <div className="absolute inset-0 z-40 flex items-center justify-center bg-muted">
          <Loader2 className="size-5 animate-spin text-muted-foreground" />
        </div>
      ) : null}

      {/* Hidden live region so screen readers hear the resolved address. */}
      <span className="sr-only" aria-live="polite">
        {resolving ? "Finding address" : ""}
      </span>
    </div>
  );
}
