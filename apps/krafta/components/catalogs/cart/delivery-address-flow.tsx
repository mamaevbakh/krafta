"use client";

// Dedicated delivery-address flow — its own full-bleed screens inside the cart
// drawer (a list of saved addresses, and a map+details editor), the way Yandex
// Go / Uber / Wolt handle address management. Rendered by checkout-step when the
// customer taps the address summary row; returns the chosen address on close.
//
// The map editor uses the fixed-centre-pin AddressMapPicker; structured detail
// fields (подъезд/этаж/квартира/домофон) are collected after the pin and stored
// in their own columns. `orderAddressString()` composes the courier-facing line
// the order snapshots.

import { useCallback, useEffect, useState } from "react";
import {
  ArrowLeft,
  Briefcase,
  Check,
  ChevronRight,
  Crosshair,
  Home,
  Loader2,
  MapPin,
  MoreVertical,
  Plus,
  Star,
  Trash2,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { DialogDescription, DialogTitle } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  createAddressAction,
  deleteAddressAction,
  listAddressesAction,
  setDefaultAddressAction,
  updateAddressAction,
} from "@/lib/cart/actions";
import type { CustomerAddress } from "@/lib/cart/addresses";
import { useStorefrontLocale } from "@/lib/catalogs/storefront-locale-context";
import {
  getStorefrontMessage,
  type StorefrontMessageKey,
} from "@/lib/locales/messages";
import { cn } from "@/lib/utils";

import { AddressMapPicker, type PickedAddress } from "./address-map-picker";

export type SelectedDeliveryAddress = {
  id?: string;
  freeform: string;
  district: string | null;
  street: string | null;
  building: string | null;
  apartment: string | null;
  entrance: string | null;
  floor: string | null;
  intercom: string | null;
  latitude: number | null;
  longitude: number | null;
};

function useT() {
  const { activeLocale, defaultLocale } = useStorefrontLocale();
  return useCallback(
    (key: StorefrontMessageKey, vars?: Record<string, string | number>) =>
      getStorefrontMessage(key, { activeLocale, defaultLocale, vars }),
    [activeLocale, defaultLocale],
  );
}

type T = ReturnType<typeof useT>;

function toSelected(a: CustomerAddress): SelectedDeliveryAddress {
  return {
    id: a.id,
    freeform: a.freeform,
    district: a.district,
    street: a.street,
    building: a.building,
    apartment: a.apartment,
    entrance: a.entrance,
    floor: a.floor,
    intercom: a.intercom,
    latitude: a.latitude,
    longitude: a.longitude,
  };
}

/** Compact "под. 2 · эт. 4 · кв. 12 · домофон 56" line for list/summary rows. */
function detailSummary(
  a: Pick<SelectedDeliveryAddress, "entrance" | "floor" | "apartment" | "intercom">,
  t: T,
): string {
  const parts: string[] = [];
  if (a.entrance?.trim()) parts.push(`${t("address.field.entrance")} ${a.entrance.trim()}`);
  if (a.floor?.trim()) parts.push(`${t("address.field.floor")} ${a.floor.trim()}`);
  if (a.apartment?.trim()) parts.push(`${t("address.field.apartment")} ${a.apartment.trim()}`);
  if (a.intercom?.trim()) parts.push(`${t("address.field.intercom")} ${a.intercom.trim()}`);
  return parts.join(" · ");
}

/** Courier-facing address string snapshotted onto the order. */
export function orderAddressString(a: SelectedDeliveryAddress, t: T): string {
  const details = detailSummary(a, t);
  return details ? `${a.freeform} · ${details}` : a.freeform;
}

function LabelIcon({ label, className }: { label: string | null; className?: string }) {
  const l = (label ?? "").toLowerCase();
  if (/home|дом|uy/.test(l)) return <Home className={className} aria-hidden />;
  if (/work|office|работа|ish|ofis/.test(l)) return <Briefcase className={className} aria-hidden />;
  return <MapPin className={className} aria-hidden />;
}

// ── Summary row (rendered inside the checkout form for delivery mode) ─────────

export function DeliveryAddressSummary({
  value,
  onChange,
  onOpen,
}: {
  value: SelectedDeliveryAddress | null;
  onChange: (a: SelectedDeliveryAddress | null) => void;
  onOpen: () => void;
}) {
  const t = useT();
  // Zero-tap default: on first mount with no selection, auto-pick the default
  // (or only) saved address so the common returning-customer case is no taps.
  useEffect(() => {
    if (value) return;
    let alive = true;
    listAddressesAction()
      .then((rows) => {
        if (!alive || rows.length === 0) return;
        onChange(toSelected(rows.find((r) => r.isDefault) ?? rows[0]));
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
    // run once on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const summary = value ? detailSummary(value, t) : "";

  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex min-h-[52px] w-full items-center gap-3 rounded-lg border border-border px-3 py-2.5 text-left transition-colors hover:bg-accent"
    >
      <LabelIcon
        label={value?.freeform ?? null}
        className="size-5 shrink-0 text-muted-foreground"
      />
      <span className="min-w-0 flex-1">
        {value ? (
          <>
            <span className="block truncate text-sm font-medium text-foreground">
              {value.freeform}
            </span>
            {summary ? (
              <span className="block truncate text-xs text-muted-foreground">
                {summary}
              </span>
            ) : null}
          </>
        ) : (
          <span className="text-sm text-muted-foreground">
            {t("address.summary_empty")}
          </span>
        )}
      </span>
      <span className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground">
        {value ? t("address.change") : null}
        <ChevronRight className="size-4" aria-hidden />
      </span>
    </button>
  );
}

// ── The full-bleed flow (list ↔ edit) ────────────────────────────────────────

type EditTarget = { mode: "add" | "edit"; address: CustomerAddress | null; autoLocate?: boolean };

export function DeliveryAddressFlow({
  value,
  onChange,
  onClose,
}: {
  value: SelectedDeliveryAddress | null;
  onChange: (a: SelectedDeliveryAddress | null) => void;
  onClose: () => void;
}) {
  const t = useT();
  const [addresses, setAddresses] = useState<CustomerAddress[]>([]);
  const [loading, setLoading] = useState(true);
  const [editTarget, setEditTarget] = useState<EditTarget | null>(null);

  useEffect(() => {
    let alive = true;
    listAddressesAction()
      .then((rows) => {
        if (!alive) return;
        setAddresses(rows);
        // No saved addresses → drop straight into the add editor.
        if (rows.length === 0) setEditTarget({ mode: "add", address: null });
      })
      .catch(() => {})
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, []);

  const handleSelect = useCallback(
    (a: CustomerAddress) => {
      onChange(toSelected(a));
      onClose();
    },
    [onChange, onClose],
  );

  const handleSaved = useCallback(
    (saved: CustomerAddress) => {
      setAddresses((prev) => [saved, ...prev.filter((a) => a.id !== saved.id)]);
      onChange(toSelected(saved));
      onClose();
    },
    [onChange, onClose],
  );

  const handleDelete = useCallback(
    async (id: string) => {
      setAddresses((prev) => prev.filter((a) => a.id !== id));
      if (value?.id === id) onChange(null);
      try {
        await deleteAddressAction(id);
      } catch {
        // best-effort
      }
    },
    [onChange, value?.id],
  );

  const handleSetDefault = useCallback(async (id: string) => {
    setAddresses((prev) =>
      prev.map((a) => ({ ...a, isDefault: a.id === id })),
    );
    try {
      await setDefaultAddressAction(id);
    } catch {
      // best-effort
    }
  }, []);

  return (
    <>
      <DialogTitle className="sr-only">{t("address.title")}</DialogTitle>
      <DialogDescription className="sr-only">{t("address.title")}</DialogDescription>
      {editTarget ? (
        <AddressEditScreen
          target={editTarget}
          t={t}
          onSaved={handleSaved}
          onBack={() =>
            addresses.length > 0 ? setEditTarget(null) : onClose()
          }
        />
      ) : (
        <AddressListScreen
          addresses={addresses}
          loading={loading}
          selectedId={value?.id ?? null}
          t={t}
          onBack={onClose}
          onSelect={handleSelect}
          onAddNew={() => setEditTarget({ mode: "add", address: null })}
          onUseLocation={() =>
            setEditTarget({ mode: "add", address: null, autoLocate: true })
          }
          onEdit={(a) => setEditTarget({ mode: "edit", address: a })}
          onSetDefault={(id) => void handleSetDefault(id)}
          onDelete={(id) => void handleDelete(id)}
        />
      )}
    </>
  );
}

// ── List screen ──────────────────────────────────────────────────────────────

function ScreenHeader({
  title,
  onBack,
}: {
  title: string;
  onBack: () => void;
}) {
  return (
    <div className="flex items-center gap-2 border-b border-border px-2 py-2">
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="size-9 text-muted-foreground"
        onClick={onBack}
        aria-label="Back"
      >
        <ArrowLeft className="size-5" />
      </Button>
      <span className="text-sm font-medium">{title}</span>
    </div>
  );
}

function AddressListScreen({
  addresses,
  loading,
  selectedId,
  t,
  onBack,
  onSelect,
  onAddNew,
  onUseLocation,
  onEdit,
  onSetDefault,
  onDelete,
}: {
  addresses: CustomerAddress[];
  loading: boolean;
  selectedId: string | null;
  t: T;
  onBack: () => void;
  onSelect: (a: CustomerAddress) => void;
  onAddNew: () => void;
  onUseLocation: () => void;
  onEdit: (a: CustomerAddress) => void;
  onSetDefault: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <ScreenHeader title={t("address.title")} onBack={onBack} />
      <div className="mx-auto w-full max-w-md flex-1 space-y-2 overflow-y-auto overscroll-contain p-4">
        {loading ? (
          <div className="flex h-10 items-center text-sm text-muted-foreground">
            <Loader2 className="mr-2 size-4 animate-spin" /> {t("address.loading")}
          </div>
        ) : (
          <>
            <button
              type="button"
              onClick={onUseLocation}
              className="flex min-h-11 w-full items-center gap-2 text-sm font-medium text-foreground"
            >
              <Crosshair className="size-4 text-muted-foreground" aria-hidden />
              {t("address.use_location")}
            </button>

            {addresses.map((a) => {
              const selected = a.id === selectedId;
              const summary = detailSummary(toSelected(a), t);
              return (
                <div
                  key={a.id}
                  className={cn(
                    "flex items-start gap-2 rounded-lg border px-3 py-2.5 transition-colors",
                    selected ? "border-foreground bg-accent" : "border-border",
                  )}
                >
                  <button
                    type="button"
                    onClick={() => onSelect(a)}
                    className="flex min-w-0 flex-1 items-start gap-3 text-left"
                  >
                    <LabelIcon
                      label={a.label}
                      className="mt-0.5 size-5 shrink-0 text-muted-foreground"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2">
                        <span className="truncate text-sm font-medium">
                          {a.label || a.freeform}
                        </span>
                        {a.isDefault ? (
                          <span className="shrink-0 rounded-full border border-border px-1.5 py-0.5 text-[10px] text-muted-foreground">
                            {t("address.default")}
                          </span>
                        ) : null}
                      </span>
                      {a.label ? (
                        <span className="block truncate text-xs text-muted-foreground">
                          {a.freeform}
                        </span>
                      ) : null}
                      {summary ? (
                        <span className="block truncate text-xs text-muted-foreground/80">
                          {summary}
                        </span>
                      ) : null}
                    </span>
                    {selected ? (
                      <Check className="mt-0.5 size-4 shrink-0 text-foreground" aria-hidden />
                    ) : null}
                  </button>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="size-8 shrink-0 text-muted-foreground"
                        aria-label={t("address.change")}
                      >
                        <MoreVertical className="size-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => onEdit(a)}>
                        {t("address.edit_title")}
                      </DropdownMenuItem>
                      {!a.isDefault ? (
                        <DropdownMenuItem onClick={() => onSetDefault(a.id)}>
                          <Star className="size-4" /> {t("address.set_default")}
                        </DropdownMenuItem>
                      ) : null}
                      <DropdownMenuItem
                        className="text-destructive focus:text-destructive"
                        onClick={() => onDelete(a.id)}
                      >
                        <Trash2 className="size-4" /> {t("address.delete")}
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              );
            })}

            <button
              type="button"
              onClick={onAddNew}
              className="flex min-h-11 w-full items-center gap-2 rounded-lg border border-dashed px-3 py-2.5 text-left text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              <Plus className="size-4 shrink-0" /> {t("address.add")}
            </button>
          </>
        )}
      </div>
    </div>
  );
}

// ── Edit screen (map pane ↔ details pane) ────────────────────────────────────

function AddressEditScreen({
  target,
  t,
  onSaved,
  onBack,
}: {
  target: EditTarget;
  t: T;
  onSaved: (saved: CustomerAddress) => void;
  onBack: () => void;
}) {
  const existing = target.address;
  const [pane, setPane] = useState<"map" | "details">(
    target.mode === "edit" ? "details" : "map",
  );
  const [mapOk, setMapOk] = useState(true);

  // Map candidate (live) + the confirmed location.
  const [candidate, setCandidate] = useState<PickedAddress | null>(
    existing && existing.latitude != null && existing.longitude != null
      ? {
          freeform: existing.freeform,
          district: existing.district,
          street: existing.street,
          building: existing.building,
          latitude: existing.latitude,
          longitude: existing.longitude,
        }
      : null,
  );
  const [resolving, setResolving] = useState(false);
  const [confirmed, setConfirmed] = useState<PickedAddress | null>(
    target.mode === "edit" ? candidate : null,
  );

  // Detail fields.
  const [entrance, setEntrance] = useState(existing?.entrance ?? "");
  const [floor, setFloor] = useState(existing?.floor ?? "");
  const [apartment, setApartment] = useState(existing?.apartment ?? "");
  const [intercom, setIntercom] = useState(existing?.intercom ?? "");
  const [note, setNote] = useState(existing?.note ?? "");
  const [label, setLabel] = useState(existing?.label ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const confirm = useCallback(() => {
    if (candidate) setConfirmed(candidate);
    setPane("details");
  }, [candidate]);

  const save = useCallback(async () => {
    const loc = confirmed ?? candidate;
    if (!loc || !loc.freeform.trim()) {
      setError(t("address.search"));
      return;
    }
    setSaving(true);
    setError(null);
    const input = {
      label: label.trim() || null,
      district: loc.district,
      street: loc.street,
      building: loc.building,
      apartment: apartment.trim() || null,
      entrance: entrance.trim() || null,
      floor: floor.trim() || null,
      intercom: intercom.trim() || null,
      note: note.trim() || null,
      freeform: loc.freeform,
      latitude: loc.latitude,
      longitude: loc.longitude,
      geoProvider: "yandex" as const,
    };
    try {
      const saved =
        target.mode === "edit" && existing
          ? await updateAddressAction(existing.id, input)
          : await createAddressAction(input);
      onSaved(saved);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't save the address.");
      setSaving(false);
    }
  }, [
    apartment,
    candidate,
    confirmed,
    entrance,
    existing,
    floor,
    intercom,
    label,
    note,
    onSaved,
    t,
    target.mode,
  ]);

  // ── Map pane ──
  if (pane === "map") {
    return (
      <div className="flex min-h-0 flex-1 flex-col">
        <ScreenHeader
          title={target.mode === "edit" ? t("address.edit_title") : t("address.new")}
          onBack={onBack}
        />
        {mapOk ? (
          <>
            <div className="relative min-h-[50dvh] flex-1">
              <AddressMapPicker
                initial={
                  existing
                    ? { latitude: existing.latitude, longitude: existing.longitude }
                    : null
                }
                autoLocate={target.autoLocate}
                searchPlaceholder={t("address.search")}
                onChange={setCandidate}
                onResolvingChange={setResolving}
                onLoadError={() => setMapOk(false)}
              />
            </div>
            <div className="border-t border-border bg-background px-4 pt-3 pb-[calc(env(safe-area-inset-bottom)+1rem)]">
              {resolving || !candidate ? (
                <div className="space-y-1.5">
                  <div className="h-4 w-2/3 animate-pulse rounded bg-muted" />
                  <p className="text-xs text-muted-foreground">
                    {t("address.resolving")}
                  </p>
                </div>
              ) : (
                <div>
                  <p className="text-sm font-medium text-foreground">
                    {candidate.freeform}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {t("address.map_hint")}
                  </p>
                </div>
              )}
              <Button
                type="button"
                size="xl"
                className="mt-3 w-full active:scale-[0.98]"
                disabled={resolving || !candidate}
                onClick={confirm}
              >
                {t("address.confirm")}
              </Button>
            </div>
          </>
        ) : (
          <ManualLocationFallback
            t={t}
            onConfirm={(picked) => {
              setCandidate(picked);
              setConfirmed(picked);
              setPane("details");
            }}
          />
        )}
      </div>
    );
  }

  // ── Details pane ──
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <ScreenHeader
        title={target.mode === "edit" ? t("address.edit_title") : t("address.new")}
        onBack={onBack}
      />
      <div className="mx-auto w-full max-w-md flex-1 space-y-4 overflow-y-auto overscroll-contain p-4">
        {/* Confirmed location strip + edit-on-map */}
        <div className="flex items-start gap-2 rounded-lg border border-border bg-card px-3 py-2.5">
          <MapPin className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
          <span className="min-w-0 flex-1 text-sm">
            {(confirmed ?? candidate)?.freeform ?? ""}
          </span>
          {mapOk ? (
            <button
              type="button"
              onClick={() => setPane("map")}
              className="shrink-0 text-xs font-medium text-foreground underline-offset-2 hover:underline"
            >
              {t("address.edit_on_map")}
            </button>
          ) : null}
        </div>

        <p className="text-xs text-muted-foreground">{t("address.helps_delivery")}</p>

        <div className="grid grid-cols-2 gap-3">
          <DetailField id="addr-entrance" label={t("address.field.entrance")} value={entrance} onChange={setEntrance} mono inputMode="numeric" />
          <DetailField id="addr-floor" label={t("address.field.floor")} value={floor} onChange={setFloor} mono inputMode="numeric" />
          <DetailField id="addr-apartment" label={t("address.field.apartment")} value={apartment} onChange={setApartment} mono inputMode="numeric" />
          <DetailField id="addr-intercom" label={t("address.field.intercom")} value={intercom} onChange={setIntercom} mono />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="addr-note">{t("address.field.note")}</Label>
          <Textarea
            id="addr-note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder={t("address.field.note_ph")}
            className="min-h-[64px] resize-none"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label>{t("address.field.label")}</Label>
          <div className="flex flex-wrap gap-2">
            {(["home", "work", "other"] as const).map((k) => {
              const text = t(`address.label.${k}` as StorefrontMessageKey);
              const active =
                k === "other"
                  ? ![t("address.label.home"), t("address.label.work")].includes(label)
                  : label === text;
              return (
                <button
                  key={k}
                  type="button"
                  onClick={() => setLabel(k === "other" ? "" : text)}
                  className={cn(
                    "rounded-full border px-3 py-1.5 text-xs font-medium transition",
                    active
                      ? "border-foreground bg-foreground text-background"
                      : "border-border bg-background text-foreground hover:border-foreground/30",
                  )}
                >
                  {text}
                </button>
              );
            })}
          </div>
          {![t("address.label.home"), t("address.label.work")].includes(label) ? (
            <Input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder={t("address.field.label")}
              className="mt-1"
            />
          ) : null}
        </div>

        {error ? <p className="text-sm text-destructive">{error}</p> : null}
      </div>

      <div className="border-t border-border bg-background px-4 pt-3 pb-[calc(env(safe-area-inset-bottom)+1rem)]">
        <Button
          type="button"
          size="xl"
          className="w-full active:scale-[0.98]"
          disabled={saving}
          onClick={() => void save()}
        >
          {saving ? <Loader2 className="size-4 animate-spin" /> : null}
          {t("address.save")}
        </Button>
        {target.mode === "edit" && existing ? (
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                className="mt-2 w-full text-destructive hover:text-destructive"
              >
                {t("address.delete")}
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>{t("address.delete_confirm_title")}</AlertDialogTitle>
                <AlertDialogDescription>
                  {t("address.delete_confirm_body")}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>{t("address.change")}</AlertDialogCancel>
                <AlertDialogAction
                  onClick={() => {
                    void deleteAddressAction(existing.id).catch(() => {});
                    onSaved({ ...existing }); // removes from list + returns
                    onBack();
                  }}
                >
                  {t("address.delete")}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        ) : null}
      </div>
    </div>
  );
}

function DetailField({
  id,
  label,
  value,
  onChange,
  mono,
  inputMode,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  mono?: boolean;
  inputMode?: "numeric" | "text";
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        value={value}
        inputMode={inputMode}
        onChange={(e) => onChange(e.target.value)}
        className={mono ? "font-mono tabular-nums" : undefined}
      />
    </div>
  );
}

// Manual fallback when ymaps3 fails to load (flaky network / blocked script).
function ManualLocationFallback({
  t,
  onConfirm,
}: {
  t: T;
  onConfirm: (picked: PickedAddress) => void;
}) {
  const [district, setDistrict] = useState("");
  const [street, setStreet] = useState("");
  const [building, setBuilding] = useState("");
  const freeform = [district.trim(), street.trim(), building.trim()]
    .filter(Boolean)
    .join(" · ");
  return (
    <div className="mx-auto w-full max-w-md flex-1 space-y-3 overflow-y-auto p-4">
      <DetailField id="m-district" label="District" value={district} onChange={setDistrict} />
      <DetailField id="m-street" label="Street" value={street} onChange={setStreet} />
      <DetailField id="m-building" label="Building" value={building} onChange={setBuilding} />
      <Button
        type="button"
        size="xl"
        className="w-full"
        disabled={!freeform}
        onClick={() =>
          onConfirm({
            freeform,
            district: district.trim() || null,
            street: street.trim() || null,
            building: building.trim() || null,
            latitude: 0,
            longitude: 0,
          })
        }
      >
        {t("address.confirm")}
      </Button>
    </div>
  );
}
