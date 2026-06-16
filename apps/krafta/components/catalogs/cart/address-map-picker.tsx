"use client";

// Yandex Maps v3 address picker. Drop a pin (tap the map or drag the marker),
// search by text, or "use my location" — each resolves to a human-readable
// address + lat/lng via Yandex reverse/forward geocoding. The structured parts
// (district/street/building) are best-effort from the geocoder; `freeform` is
// always set and is what the order snapshots.
//
// The Yandex JS API v3 is loaded on demand from a <script> (the apikey is
// public-by-design, domain-restricted). If the key is missing or the script
// fails, the host form falls back to manual entry — this component reports the
// failure via onLoadError instead of blocking checkout.

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

// [lng, lat] — Yandex v3 uses lon-first coordinates.
const TASHKENT_CENTER: [number, number] = [69.2401, 41.2995];

const YMAPS_KEY = process.env.NEXT_PUBLIC_YANDEX_MAPS_API_KEY ?? "";

/* eslint-disable @typescript-eslint/no-explicit-any */
type Ymaps3 = any;

let ymapsPromise: Promise<Ymaps3> | null = null;

/** Load + ready the Yandex Maps v3 global exactly once per page. */
function loadYmaps(): Promise<Ymaps3> {
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
    const existing = document.querySelector<HTMLScriptElement>("script[data-ymaps3]");
    if (existing) {
      existing.addEventListener("load", onReady);
      existing.addEventListener("error", () =>
        reject(new Error("Yandex Maps script failed to load.")),
      );
      return;
    }
    const script = document.createElement("script");
    script.src = `https://api-maps.yandex.ru/v3/?apikey=${encodeURIComponent(YMAPS_KEY)}&lang=ru_RU`;
    script.async = true;
    script.dataset.ymaps3 = "1";
    script.addEventListener("load", onReady);
    script.addEventListener("error", () => {
      ymapsPromise = null;
      reject(new Error("Yandex Maps script failed to load."));
    });
    document.head.appendChild(script);
  });
  return ymapsPromise;
}

/** Pull a tidy address + structured parts out of a v3 geocoder feature. */
function featureToAddress(
  feature: any,
  coordinates: [number, number],
): PickedAddress {
  const props = feature?.properties ?? {};
  const freeform: string =
    props.name ||
    props.description ||
    props.text ||
    feature?.title ||
    "";
  // v3 returns a components array like [{kind:'district',name},{kind:'street'...}].
  const components: Array<{ kind?: string; name?: string }> = Array.isArray(
    props.geocoderMetadata?.address?.components,
  )
    ? props.geocoderMetadata.address.components
    : Array.isArray(props.components)
      ? props.components
      : [];
  const byKind = (kind: string) =>
    components.find((c) => c.kind === kind)?.name ?? null;
  return {
    freeform: freeform || `${coordinates[1].toFixed(5)}, ${coordinates[0].toFixed(5)}`,
    district: byKind("district") ?? byKind("area"),
    street: byKind("street"),
    building: byKind("house"),
    latitude: coordinates[1],
    longitude: coordinates[0],
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
  const ymapsRef = useRef<Ymaps3 | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [locating, setLocating] = useState(false);
  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);

  // Reverse-geocode a coordinate and bubble the resolved address up.
  const resolveAndEmit = useCallback(
    async (coordinates: [number, number]) => {
      const ymaps3 = ymapsRef.current;
      if (!ymaps3) return;
      try {
        const results = await ymaps3.search({ text: coordinates });
        const feature = results?.[0];
        onChange(
          feature
            ? featureToAddress(feature, coordinates)
            : {
                freeform: `${coordinates[1].toFixed(5)}, ${coordinates[0].toFixed(5)}`,
                district: null,
                street: null,
                building: null,
                latitude: coordinates[1],
                longitude: coordinates[0],
              },
        );
      } catch {
        // Reverse geocode failed — still emit the raw point so the order has
        // coordinates; the merchant can read them off the map link.
        onChange({
          freeform: `${coordinates[1].toFixed(5)}, ${coordinates[0].toFixed(5)}`,
          district: null,
          street: null,
          building: null,
          latitude: coordinates[1],
          longitude: coordinates[0],
        });
      }
    },
    [onChange],
  );

  const moveMarker = useCallback(
    (coordinates: [number, number], pan = true) => {
      const marker = markerRef.current;
      const map = mapRef.current;
      if (marker?.update) marker.update({ coordinates });
      if (pan && map?.update) {
        map.update({ location: { center: coordinates, duration: 300 } });
      }
    },
    [],
  );

  // Mount the map once Yandex is ready.
  useEffect(() => {
    let disposed = false;
    loadYmaps()
      .then((ymaps3) => {
        if (disposed || !hostRef.current) return;
        ymapsRef.current = ymaps3;
        const start: [number, number] =
          initial?.latitude != null && initial?.longitude != null
            ? [initial.longitude, initial.latitude]
            : TASHKENT_CENTER;

        const map = new ymaps3.YMap(hostRef.current, {
          location: { center: start, zoom: 15 },
          behaviors: ["drag", "pinchZoom", "dblClick", "scrollZoom"],
        });
        map.addChild(new ymaps3.YMapDefaultSchemeLayer({}));
        map.addChild(new ymaps3.YMapDefaultFeaturesLayer({}));

        const markerEl = document.createElement("div");
        markerEl.className =
          "h-6 w-6 -translate-x-1/2 -translate-y-full rounded-full border-2 border-background bg-foreground shadow-lg";
        const marker = new ymaps3.YMapMarker(
          { coordinates: start, draggable: true, onDragEnd: (c: [number, number]) => resolveAndEmit(c) },
          markerEl,
        );
        map.addChild(marker);

        // Tap the map to move the pin.
        map.addChild(
          new ymaps3.YMapListener({
            onClick: (_obj: unknown, event: any) => {
              const c = event?.coordinates as [number, number] | undefined;
              if (c) {
                moveMarker(c, false);
                void resolveAndEmit(c);
              }
            },
          }),
        );

        mapRef.current = map;
        markerRef.current = marker;
        setStatus("ready");
        // Seed the host form with the starting point's address.
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
    const ymaps3 = ymapsRef.current;
    const text = query.trim();
    if (!ymaps3 || !text) return;
    setSearching(true);
    try {
      const results = await ymaps3.search({ text, center: TASHKENT_CENTER, zoom: 12 });
      const feature = results?.[0];
      const c = feature?.geometry?.coordinates as [number, number] | undefined;
      if (c) {
        moveMarker(c);
        onChange(featureToAddress(feature, c));
      }
    } catch {
      // no-op: a failed search just leaves the current pin
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
        const c: [number, number] = [pos.coords.longitude, pos.coords.latitude];
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
