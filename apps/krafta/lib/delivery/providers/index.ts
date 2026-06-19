import type { DeliveryProvider, DeliveryProviderId } from "./types";
import { yandexProvider } from "./yandex";

export * from "./types";

/**
 * Resolve a courier provider implementation by id. Today only Yandex is wired;
 * the seam lets a future provider (Glovo, a local courier API) drop in without
 * touching checkout/dispatch. Returns null for an unimplemented provider.
 */
export function getDeliveryProvider(
  id: DeliveryProviderId,
): DeliveryProvider | null {
  if (id === "yandex") return yandexProvider;
  return null;
}
