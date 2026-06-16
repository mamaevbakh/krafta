"use client";

// Yandex Maps v2.1 address picker. Drop a pin (tap the map or drag the marker),
// search by text, or "use my location" — each resolves to a human-readable
// address + lat/lng via Yandex reverse/forward geocoding. Structured parts
// (district/street/building) are best-effort from the geocoder; `freeform` is
// always set and is what the order snapshots.
//
// v2.1 (not v3): the project's API key is issued for the classic "JavaScript
// API and Geocoder" product, which serves the /2.1/ endpoint and the global
// `ymaps`. (v3 returns "Invalid api key" for this key.) The script is loaded on
// demand; the apikey is public-by-design (domain-restricted). If the key is
// missing or the script fails (e.g. an off-allowlist origin like localhost),
// the host form falls back to manual entry via onLoadError.
//
// NOTE: v2.1 coordinates are [latitude, longitude] (lat-first).

import { useCallback, useEffect, useRef, useState } from "react";
import { Crosshair, Loader2, Search } from "lucide-react";

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

// [lat, lng] — v2.1 is latitude-first.
const TASHKENT_CENTER: [number, number] = [41.2995, 69.2401];

const YMAPS_KEY = process.env.NEXT_PUBLIC_YANDEX_MAPS_API_KEY ?? "";

/* eslint-disable @typescript-eslint/no-explicit-any */
type Ymaps = any;

let ymapsPromise: Promise<Ymaps> | null = null;

/** Load + ready the Yandex Maps v2.1 global exactly once per page. */
function loadYmaps(): Promise<Ymaps> {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("Yandex Maps needs a browser."));
  }
  const w = window as any;
  if (w.ymaps?.Map) return Promise.resolve(w.ymaps);
  if (ymapsPromise) return ymapsPromise;
  if (!YMAPS_KEY) return Promise.reject(new Error("Yandex Maps key is not set."));

  ymapsPromise = new Promise<Ymaps>((resolve, reject) => {
    const onReady = () => {
      // ymaps.ready fires once the API modules are parsed.
      w.ymaps.ready(() => resolve(w.ymaps));
    };
    const fail = () => {
      ymapsPromise = null;
      reject(new Error("Yandex Maps script failed to load."));
    };
    const existing = document.querySelector<HTMLScriptElement>("script[data-ymaps]");
    if (existing) {
      if (w.ymaps) onReady();
      else existing.addEventListener("load", onReady);
      existing.addEventListener("error", fail);
      return;
    }
    const script = document.createElement("script");
    script.src = `https://api-maps.yandex.ru/2.1/?apikey=${encodeURIComponent(YMAPS_KEY)}&lang=ru_RU`;
    script.async = true;
    script.dataset.ymaps = "1";
    script.addEventListener("load", onReady);
    script.addEventListener("error", fail);
    document.head.appendChild(script);
  });
  return ymapsPromise;
}

/** Pull a tidy address + structured parts out of a v2.1 geocoder GeoObject. */
function geoObjectToAddress(
  obj: any,
  coords: [number, number],
): PickedAddress {
  const addressLine: string =
    (typeof obj?.getAddressLine === "function" ? obj.getAddressLine() : "") || "";
  let components: Array<{ kind?: string; name?: string }> = [];
  try {
    components =
      obj?.properties?.get?.("metaDataProperty.GeocoderMetaData.Address.Components") ??
      [];
  } catch {
    components = [];
  }
  const byKind = (kind: string) =>
    components.find((c) => c.kind === kind)?.name ?? null;
  const street =
    byKind("street") ||
    (typeof obj?.getThoroughfare === "function" ? obj.getThoroughfare() : "") ||
    null;
  const building =
    byKind("house") ||
    (typeof obj?.getPremiseNumber === "function" ? obj.getPremiseNumber() : "") ||
    null;
  return {
    freeform: addressLine || `${coords[0].toFixed(5)}, ${coords[1].toFixed(5)}`,
    district: byKind("district") ?? byKind("area"),
    street: street || null,
    building: building || null,
    latitude: coords[0],
    longitude: coords[1],
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
  const ymapsRef = useRef<Ymaps | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [locating, setLocating] = useState(false);
  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);

  // Reverse-geocode a coordinate and bubble the resolved address up.
  const resolveAndEmit = useCallback(
    async (coords: [number, number]) => {
      const ymaps = ymapsRef.current;
      const fallback: PickedAddress = {
        freeform: `${coords[0].toFixed(5)}, ${coords[1].toFixed(5)}`,
        district: null,
        street: null,
        building: null,
        latitude: coords[0],
        longitude: coords[1],
      };
      if (!ymaps) return onChange(fallback);
      try {
        const res = await ymaps.geocode(coords, { results: 1 });
        const obj = res?.geoObjects?.get?.(0);
        onChange(obj ? geoObjectToAddress(obj, coords) : fallback);
      } catch {
        onChange(fallback);
      }
    },
    [onChange],
  );

  const moveMarker = useCallback((coords: [number, number], pan = true) => {
    markerRef.current?.geometry?.setCoordinates?.(coords);
    if (pan) mapRef.current?.setCenter?.(coords, 16, { duration: 300 });
  }, []);

  // Mount the map once Yandex is ready.
  useEffect(() => {
    let disposed = false;
    loadYmaps()
      .then((ymaps) => {
        if (disposed || !hostRef.current) return;
        ymapsRef.current = ymaps;
        const start: [number, number] =
          initial?.latitude != null && initial?.longitude != null
            ? [initial.latitude, initial.longitude]
            : TASHKENT_CENTER;

        const map = new ymaps.Map(
          hostRef.current,
          { center: start, zoom: 15, controls: ["zoomControl"] },
          { suppressMapOpenBlock: true },
        );
        const marker = new ymaps.Placemark(start, {}, { draggable: true });
        map.geoObjects.add(marker);

        marker.events.add("dragend", () => {
          const c = marker.geometry.getCoordinates() as [number, number];
          void resolveAndEmit(c);
        });
        map.events.add("click", (e: any) => {
          const c = e.get("coords") as [number, number] | undefined;
          if (c) {
            marker.geometry.setCoordinates(c);
            void resolveAndEmit(c);
          }
        });

        mapRef.current = map;
        markerRef.current = marker;
        setStatus("ready");
        void resolveAndEmit(start);
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

  const runSearch = useCallback(async () => {
    const ymaps = ymapsRef.current;
    const text = query.trim();
    if (!ymaps || !text) return;
    setSearching(true);
    try {
      const res = await ymaps.geocode(text, { results: 1 });
      const obj = res?.geoObjects?.get?.(0);
      const c = obj?.geometry?.getCoordinates?.() as [number, number] | undefined;
      if (c) {
        moveMarker(c);
        onChange(geoObjectToAddress(obj, c));
      }
    } catch {
      // a failed search just leaves the current pin
    } finally {
      setSearching(false);
    }
  }, [query, moveMarker, onChange]);

  const useMyLocation = useCallback(() => {
    if (!navigator.geolocation) return;
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false);
        const c: [number, number] = [pos.coords.latitude, pos.coords.longitude];
        moveMarker(c);
        void resolveAndEmit(c);
      },
      () => setLocating(false),
      { enableHighAccuracy: true, timeout: 10_000 },
    );
  }, [moveMarker, resolveAndEmit]);

  if (status === "error") return null;

  return (
    <div className={cn("space-y-2", className)}>
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void runSearch();
              }
            }}
            placeholder="Search address"
            className="pl-9"
            aria-label="Search address"
          />
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
        {searching ? (
          <div className="absolute right-2 top-2 rounded-full bg-background/90 p-1.5 shadow">
            <Loader2 className="size-4 animate-spin text-muted-foreground" />
          </div>
        ) : null}
      </div>
      <p className="text-xs text-muted-foreground">
        Tap the map or drag the pin to set your exact spot.
      </p>
    </div>
  );
}
