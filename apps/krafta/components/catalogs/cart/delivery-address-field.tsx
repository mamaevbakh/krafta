"use client";

// Delivery address book, in checkout. Replaces the three free-text address
// fields with: pick a saved address, or add a new one. Adding uses the Yandex
// map picker when it loads (tap/drag/search/locate -> structured parts + coords)
// and a manual structured form as the always-available fallback. The selected
// address's `freeform` is what the order snapshots; coords ride along for a
// later courier-routing pass.

import { useCallback, useEffect, useState } from "react";
import { Check, Loader2, MapPin, Plus, Trash2, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  createAddressAction,
  deleteAddressAction,
  listAddressesAction,
} from "@/lib/cart/actions";
import type { CustomerAddress } from "@/lib/cart/addresses";
import { cn } from "@/lib/utils";

import { AddressMapPicker, type PickedAddress } from "./address-map-picker";

export type SelectedDeliveryAddress = {
  id?: string;
  freeform: string;
  district: string | null;
  street: string | null;
  building: string | null;
  latitude: number | null;
  longitude: number | null;
};

function composeFreeform(parts: {
  district: string;
  street: string;
  building: string;
  apartment: string;
}): string {
  const head = [parts.district.trim(), parts.street.trim(), parts.building.trim()]
    .filter(Boolean)
    .join(" · ");
  return parts.apartment.trim() ? `${head}, ${parts.apartment.trim()}` : head;
}

export function DeliveryAddressField({
  value,
  onChange,
}: {
  value: SelectedDeliveryAddress | null;
  onChange: (next: SelectedDeliveryAddress | null) => void;
}) {
  const [addresses, setAddresses] = useState<CustomerAddress[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);

  const selectSaved = useCallback(
    (a: CustomerAddress) =>
      onChange({
        id: a.id,
        freeform: a.freeform,
        district: a.district,
        street: a.street,
        building: a.building,
        latitude: a.latitude,
        longitude: a.longitude,
      }),
    [onChange],
  );

  // Load saved addresses; auto-select the default (or the only one) so the
  // common case is zero taps.
  useEffect(() => {
    let alive = true;
    listAddressesAction()
      .then((rows) => {
        if (!alive) return;
        setAddresses(rows);
        if (!value && rows.length > 0) {
          selectSaved(rows.find((r) => r.isDefault) ?? rows[0]);
        }
        if (rows.length === 0) setAdding(true);
      })
      .catch(() => {})
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
    // run once on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSaved = useCallback(
    (created: CustomerAddress) => {
      setAddresses((prev) => [created, ...prev.filter((a) => a.id !== created.id)]);
      selectSaved(created);
      setAdding(false);
    },
    [selectSaved],
  );

  const remove = useCallback(
    async (id: string) => {
      setAddresses((prev) => prev.filter((a) => a.id !== id));
      if (value?.id === id) onChange(null);
      try {
        await deleteAddressAction(id);
      } catch {
        // best-effort; a stale row reappears on next open
      }
    },
    [onChange, value?.id],
  );

  if (loading) {
    return (
      <div className="flex h-10 items-center text-sm text-muted-foreground">
        <Loader2 className="mr-2 size-4 animate-spin" /> Loading your addresses…
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {addresses.map((a) => {
        const selected = value?.id === a.id;
        return (
          <div
            key={a.id}
            className={cn(
              "flex items-center gap-2 rounded-lg border px-3 py-2.5 transition-colors",
              selected ? "border-foreground bg-accent" : "border-border",
            )}
          >
            <button
              type="button"
              onClick={() => selectSaved(a)}
              className="flex min-w-0 flex-1 items-center gap-3 text-left"
            >
              <span
                className={cn(
                  "flex size-5 shrink-0 items-center justify-center rounded-full border",
                  selected ? "border-foreground bg-foreground text-background" : "border-input",
                )}
              >
                {selected ? <Check className="size-3.5" /> : null}
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2">
                  <span className="truncate text-sm font-medium">
                    {a.label || a.freeform}
                  </span>
                  {a.isDefault ? (
                    <span className="shrink-0 rounded-full border border-border px-1.5 py-0.5 text-[10px] text-muted-foreground">
                      Default
                    </span>
                  ) : null}
                </span>
                {a.label ? (
                  <span className="block truncate text-xs text-muted-foreground">
                    {a.freeform}
                  </span>
                ) : null}
              </span>
            </button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-8 shrink-0 text-muted-foreground"
              aria-label="Delete address"
              onClick={() => void remove(a.id)}
            >
              <Trash2 className="size-4" />
            </Button>
          </div>
        );
      })}

      {adding ? (
        <AddAddressForm
          onCancel={() => setAdding(false)}
          onSaved={handleSaved}
          canCancel={addresses.length > 0}
        />
      ) : (
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="flex min-h-11 w-full items-center gap-2 rounded-lg border border-dashed px-3 py-2 text-left text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          <Plus className="size-4 shrink-0" /> Add a delivery address
        </button>
      )}
    </div>
  );
}

function AddAddressForm({
  onSaved,
  onCancel,
  canCancel,
}: {
  onSaved: (created: CustomerAddress) => void;
  onCancel: () => void;
  canCancel: boolean;
}) {
  const [district, setDistrict] = useState("");
  const [street, setStreet] = useState("");
  const [building, setBuilding] = useState("");
  const [apartment, setApartment] = useState("");
  const [label, setLabel] = useState("");
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [mapFreeform, setMapFreeform] = useState<string | null>(null);
  const [mapOk, setMapOk] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onPick = useCallback((picked: PickedAddress) => {
    if (picked.district) setDistrict(picked.district);
    if (picked.street) setStreet(picked.street);
    if (picked.building) setBuilding(picked.building);
    setCoords({ lat: picked.latitude, lng: picked.longitude });
    setMapFreeform(picked.freeform);
  }, []);

  const save = useCallback(async () => {
    const freeform =
      composeFreeform({ district, street, building, apartment }) || mapFreeform || "";
    if (!freeform.trim()) {
      setError("Add a street or pick a spot on the map.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const created = await createAddressAction({
        label: label.trim() || null,
        district: district.trim() || null,
        street: street.trim() || null,
        building: building.trim() || null,
        apartment: apartment.trim() || null,
        freeform,
        latitude: coords?.lat ?? null,
        longitude: coords?.lng ?? null,
        geoProvider: coords ? "yandex" : null,
      });
      onSaved(created);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't save the address.");
    } finally {
      setSaving(false);
    }
  }, [apartment, building, coords, district, label, mapFreeform, onSaved, street]);

  return (
    <div className="space-y-3 rounded-lg border bg-card p-4">
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-2 text-sm font-medium">
          <MapPin className="size-4" /> New address
        </span>
        {canCancel ? (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-7 text-muted-foreground"
            aria-label="Cancel"
            onClick={onCancel}
          >
            <X className="size-4" />
          </Button>
        ) : null}
      </div>

      {mapOk ? <AddressMapPicker onChange={onPick} onLoadError={() => setMapOk(false)} /> : null}

      {mapFreeform ? (
        <p className="flex items-start gap-2 text-sm text-foreground">
          <MapPin className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
          {mapFreeform}
        </p>
      ) : null}

      <div className="grid grid-cols-3 gap-2">
        <div className="col-span-3 flex flex-col gap-1">
          <Label htmlFor="addr-district">District</Label>
          <Input
            id="addr-district"
            value={district}
            onChange={(e) => setDistrict(e.target.value)}
            autoComplete="address-level2"
          />
        </div>
        <div className="col-span-3 flex flex-col gap-1">
          <Label htmlFor="addr-street">Street</Label>
          <Input
            id="addr-street"
            value={street}
            onChange={(e) => setStreet(e.target.value)}
            autoComplete="street-address"
          />
        </div>
        <div className="col-span-1 flex flex-col gap-1">
          <Label htmlFor="addr-building">Building</Label>
          <Input id="addr-building" value={building} onChange={(e) => setBuilding(e.target.value)} />
        </div>
        <div className="col-span-2 flex flex-col gap-1">
          <Label htmlFor="addr-apartment">Apt / office</Label>
          <Input id="addr-apartment" value={apartment} onChange={(e) => setApartment(e.target.value)} />
        </div>
        <div className="col-span-3 flex flex-col gap-1">
          <Label htmlFor="addr-label">Label (optional)</Label>
          <Input
            id="addr-label"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="Home, Work…"
          />
        </div>
      </div>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      <Button type="button" className="w-full" onClick={() => void save()} disabled={saving}>
        {saving ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
        Save address
      </Button>
    </div>
  );
}
