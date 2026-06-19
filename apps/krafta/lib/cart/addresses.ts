import "server-only";

// Customer address book (commerce.customer_addresses) data access.
//
// Addresses belong to the PERSON (auth.uid()), not a per-org customer row, so
// a saved home address follows the customer to every shop. RLS scopes every
// read/write to the owner; we still resolve the uid explicitly because INSERT's
// WITH CHECK requires user_id = auth.uid(), and `is_default` is enforced by a
// partial unique index — only one default per user — so setting a new default
// clears the previous one first (same session, same uid, RLS-safe).

import { createClient } from "@/lib/supabase/server";
import { ensureCustomerUserId } from "./identity";

export type CustomerAddress = {
  id: string;
  label: string | null;
  district: string | null;
  street: string | null;
  building: string | null;
  apartment: string | null;
  entrance: string | null;
  floor: string | null;
  intercom: string | null;
  note: string | null;
  freeform: string;
  latitude: number | null;
  longitude: number | null;
  geoProvider: string | null;
  isDefault: boolean;
};

export type CustomerAddressInput = {
  label?: string | null;
  district?: string | null;
  street?: string | null;
  building?: string | null;
  apartment?: string | null;
  entrance?: string | null;
  floor?: string | null;
  intercom?: string | null;
  note?: string | null;
  freeform: string;
  latitude?: number | null;
  longitude?: number | null;
  geoProvider?: string | null;
  isDefault?: boolean;
};

const SELECT_COLS =
  "id,label,district,street,building,apartment,entrance,floor,intercom,note,freeform,latitude,longitude,geo_provider,is_default";

type AddressRow = {
  id: string;
  label: string | null;
  district: string | null;
  street: string | null;
  building: string | null;
  apartment: string | null;
  entrance: string | null;
  floor: string | null;
  intercom: string | null;
  note: string | null;
  freeform: string;
  latitude: number | null;
  longitude: number | null;
  geo_provider: string | null;
  is_default: boolean;
};

function toAddress(row: AddressRow): CustomerAddress {
  return {
    id: row.id,
    label: row.label,
    district: row.district,
    street: row.street,
    building: row.building,
    apartment: row.apartment,
    entrance: row.entrance,
    floor: row.floor,
    intercom: row.intercom,
    note: row.note,
    freeform: row.freeform,
    latitude: row.latitude,
    longitude: row.longitude,
    geoProvider: row.geo_provider,
    isDefault: row.is_default,
  };
}

type Client = Awaited<ReturnType<typeof createClient>>;

/** Clear the current default so a new one can be set without tripping the
 *  one-default-per-user partial unique index. */
async function clearDefault(supabase: Client, userId: string): Promise<void> {
  await supabase
    .schema("commerce")
    .from("customer_addresses")
    .update({ is_default: false })
    .eq("user_id", userId)
    .eq("is_default", true);
}

export async function listAddresses(): Promise<CustomerAddress[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .schema("commerce")
    .from("customer_addresses")
    .select(SELECT_COLS)
    .order("is_default", { ascending: false })
    .order("updated_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => toAddress(r as AddressRow));
}

export async function createAddress(
  input: CustomerAddressInput,
): Promise<CustomerAddress> {
  const supabase = await createClient();
  const userId = await ensureCustomerUserId(supabase);
  // First address for this user is the default regardless of the flag.
  const { count } = await supabase
    .schema("commerce")
    .from("customer_addresses")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId);
  const makeDefault = input.isDefault === true || (count ?? 0) === 0;
  if (makeDefault) await clearDefault(supabase, userId);

  const { data, error } = await supabase
    .schema("commerce")
    .from("customer_addresses")
    .insert({
      user_id: userId,
      label: input.label ?? null,
      district: input.district ?? null,
      street: input.street ?? null,
      building: input.building ?? null,
      apartment: input.apartment ?? null,
      entrance: input.entrance ?? null,
      floor: input.floor ?? null,
      intercom: input.intercom ?? null,
      note: input.note ?? null,
      freeform: input.freeform,
      latitude: input.latitude ?? null,
      longitude: input.longitude ?? null,
      geo_provider: input.geoProvider ?? null,
      is_default: makeDefault,
    })
    .select(SELECT_COLS)
    .single();
  if (error) throw new Error(error.message);
  return toAddress(data as AddressRow);
}

export async function updateAddress(
  id: string,
  input: CustomerAddressInput,
): Promise<CustomerAddress> {
  const supabase = await createClient();
  const userId = await ensureCustomerUserId(supabase);
  if (input.isDefault === true) await clearDefault(supabase, userId);

  const { data, error } = await supabase
    .schema("commerce")
    .from("customer_addresses")
    .update({
      label: input.label ?? null,
      district: input.district ?? null,
      street: input.street ?? null,
      building: input.building ?? null,
      apartment: input.apartment ?? null,
      entrance: input.entrance ?? null,
      floor: input.floor ?? null,
      intercom: input.intercom ?? null,
      note: input.note ?? null,
      freeform: input.freeform,
      latitude: input.latitude ?? null,
      longitude: input.longitude ?? null,
      geo_provider: input.geoProvider ?? null,
      ...(input.isDefault === undefined ? {} : { is_default: input.isDefault }),
    })
    .eq("id", id)
    .select(SELECT_COLS)
    .single();
  if (error) throw new Error(error.message);
  return toAddress(data as AddressRow);
}

export async function deleteAddress(id: string): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase
    .schema("commerce")
    .from("customer_addresses")
    .delete()
    .eq("id", id);
  if (error) throw new Error(error.message);
}

export async function setDefaultAddress(id: string): Promise<void> {
  const supabase = await createClient();
  const userId = await ensureCustomerUserId(supabase);
  await clearDefault(supabase, userId);
  const { error } = await supabase
    .schema("commerce")
    .from("customer_addresses")
    .update({ is_default: true })
    .eq("id", id);
  if (error) throw new Error(error.message);
}
