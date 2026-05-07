"use server";

import { ensureCartIdentity, type CartIdentity } from "./identity";

/**
 * Server action wrapper around `ensureCartIdentity` so client components can
 * call it from event handlers / form submissions.
 *
 * Usage:
 *   const id = await ensureCartIdentityAction(orgId);
 */
export async function ensureCartIdentityAction(
  orgId: string,
): Promise<CartIdentity> {
  return ensureCartIdentity(orgId);
}
