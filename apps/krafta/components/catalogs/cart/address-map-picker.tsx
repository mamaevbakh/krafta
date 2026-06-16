"use client";

// Yandex Maps JS API v3 (ymaps3) address picker. Drop a pin (tap the map or
// drag the marker), or type for live autocomplete — each resolves to a
// human-readable address + lat/lng. Structured parts (district/street/building)
// are best-effort; `freeform` is always set and is what the order snapshots.
//
// v3 has NO built-in geocoder/suggest, so address resolution goes through our
// server proxy (/api/yandex/geocode, /api/yandex/suggest) which holds the
// Geocoder + Geosuggest keys server-side. The MAP itself loads with the public
// JS-API key (NEXT_PUBLIC_YANDEX_MAPS_API_KEY). If the script fails, the host
// form falls back to manual entry via onLoadError.
//
// COORDINATES IN v3 ARE [longitude, latitude] (GeoJSON order).

import { useCallback, useEffect, useRef, useState } from "react";
import { Crosshair, Loader2, MapPin, Search } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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

export function AddressMapPicker({
  initial,
  onChange,
  onLoadError,
  className,
}: {
  initial?: { latitude: number | null; longitude: number | null } | null;
  onChange: (address: PickedAddress) => void;
  onLoadError?: (message: string) => void;
  className?: string;
}) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<any>(null);
  const markerRef = useRef<any>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [locating, setLocating] = useState(false);
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [resolving, setResolving] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const moveMarker = useCallback((c: [number, number], pan = true) => {
    markerRef.current?.update?.({ coordinates: c });
    if (pan) {
      mapRef.current?.update?.({ location: { center: c, zoom: 16, duration: 300 } });
    }
  }, []);

  // Reverse-geocode a dropped/clicked point via the proxy. Keep the pin's
  // exact coordinates (what the customer chose), use the geocoder for text.
  const emitFromCoords = useCallback(
    async (c: [number, number]) => {
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
      }
    },
    [onChange],
  );

  // Mount the map once v3 is ready.
  useEffect(() => {
    let disposed = false;
    loadYmaps3()
      .then((ymaps3) => {
        if (disposed || !hostRef.current) return;
        const {
          YMap,
          YMapDefaultSchemeLayer,
          YMapDefaultFeaturesLayer,
          YMapMarker,
          YMapListener,
        } = ymaps3;
        const start: [number, number] =
          initial?.latitude != null && initial?.longitude != null
            ? [initial.longitude, initial.latitude]
            : TASHKENT_CENTER;

        const map = new YMap(hostRef.current, {
          location: { center: start, zoom: 15 },
        });
        map.addChild(new YMapDefaultSchemeLayer({}));
        map.addChild(new YMapDefaultFeaturesLayer({}));

        const pin = document.createElement("div");
        pin.className =
          "size-5 -translate-x-1/2 -translate-y-full rounded-full border-2 border-background bg-foreground shadow-lg";
        const marker = new YMapMarker(
          {
            coordinates: start,
            draggable: true,
            onDragEnd: (c: [number, number]) => void emitFromCoords(c),
          },
          pin,
        );
        map.addChild(marker);

        map.addChild(
          new YMapListener({
            layer: "any",
            onClick: (object: unknown, event: any) => {
              if (object) return; // ignore taps on the marker itself
              const c = event?.coordinates as [number, number] | undefined;
              if (c) {
                marker.update({ coordinates: c });
                void emitFromCoords(c);
              }
            },
          }),
        );

        mapRef.current = map;
        markerRef.current = marker;
        setStatus("ready");
        void emitFromCoords(start);
      })
      .catch((err: unknown) => {
        if (disposed) return;
        setStatus("error");
        onLoadError?.(err instanceof Error ? err.message : "Map unavailable.");
      });

    return () => {
      disposed = true;
      try {
        mapRef.current?.destroy?.();
      } catch {
        // already torn down
      }
      mapRef.current = null;
      markerRef.current = null;
    };
    // initial is read once on mount on purpose.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Debounced autocomplete.
  const onQueryChange = useCallback((value: string) => {
    setQuery(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const text = value.trim();
    if (text.length < 3) {
      setSuggestions([]);
      return;
    }
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/yandex/suggest?text=${encodeURIComponent(text)}`);
        const json = (await res.json()) as { results: Suggestion[] };
        setSuggestions(json.results ?? []);
      } catch {
        setSuggestions([]);
      }
    }, 250);
  }, []);

  // Resolve a chosen suggestion (uri -> coords + address) via the proxy.
  const pickSuggestion = useCallback(
    async (s: Suggestion) => {
      setQuery(s.title);
      setSuggestions([]);
      setResolving(true);
      try {
        const res = await fetch(`/api/yandex/geocode?uri=${encodeURIComponent(s.uri)}`);
        const json = (await res.json()) as { address: PickedAddress | null };
        if (json.address?.latitude != null && json.address?.longitude != null) {
          moveMarker([json.address.longitude, json.address.latitude]);
          onChange(json.address);
        }
      } catch {
        // leave the pin where it is
      } finally {
        setResolving(false);
      }
    },
    [moveMarker, onChange],
  );

  const useMyLocation = useCallback(() => {
    if (!navigator.geolocation) return;
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false);
        const c: [number, number] = [pos.coords.longitude, pos.coords.latitude];
        moveMarker(c);
        void emitFromCoords(c);
      },
      () => setLocating(false),
      { enableHighAccuracy: true, timeout: 10_000 },
    );
  }, [moveMarker, emitFromCoords]);

  if (status === "error") return null;

  return (
    <div className={cn("space-y-2", className)}>
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            placeholder="Search address"
            className="pl-9"
            aria-label="Search address"
            autoComplete="off"
          />
          {resolving ? (
            <Loader2 className="absolute right-3 top-1/2 size-4 -translate-y-1/2 animate-spin text-muted-foreground" />
          ) : null}
          {suggestions.length > 0 ? (
            <ul className="absolute z-20 mt-1 max-h-56 w-full overflow-y-auto rounded-lg border bg-popover p-1 shadow-md">
              {suggestions.map((s) => (
                <li key={s.uri}>
                  <button
                    type="button"
                    onClick={() => void pickSuggestion(s)}
                    className="flex w-full items-start gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent"
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
        <Button
          type="button"
          variant="outline"
          size="icon"
          onClick={useMyLocation}
          disabled={locating}
          aria-label="Use my location"
        >
          {locating ? <Loader2 className="size-4 animate-spin" /> : <Crosshair className="size-4" />}
        </Button>
      </div>
      <div className="relative h-56 w-full overflow-hidden rounded-lg border bg-muted">
        <div ref={hostRef} className="h-full w-full" />
        {status === "loading" ? (
          <div className="absolute inset-0 flex items-center justify-center bg-muted">
            <Loader2 className="size-5 animate-spin text-muted-foreground" />
          </div>
        ) : null}
      </div>
      <p className="text-xs text-muted-foreground">
        Search, or tap the map / drag the pin to set your exact spot.
      </p>
    </div>
  );
}
