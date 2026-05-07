"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";

export type OrderAction =
  | "accept"
  | "mark_ready"
  | "mark_completed"
  | "cancel";

type TransitionInput = {
  orderId: string;
  fulfillmentId: string;
  action: OrderAction;
  cancelReason?: string | null;
  catalogPath: string;
};

type Result = { ok: true } | { ok: false; error: string };

/**
 * Drives the order's lifecycle from the merchant dashboard. One server
 * action handles every transition; the action argument decides target
 * state + which timestamps to stamp on the per-mode details row.
 *
 * State machine (per ADR 0001 §3.3):
 *   proposed -> reserved -> prepared -> completed | canceled | failed
 */
export async function transitionOrderState(
  input: TransitionInput,
): Promise<Result> {
  const supabase = await createClient();

  // Read current state to validate the transition + know which subtype to
  // touch.
  const { data: fulfillment, error: readError } = await supabase
    .schema("commerce")
    .from("fulfillments")
    .select("id, order_id, type, state")
    .eq("id", input.fulfillmentId)
    .maybeSingle();
  if (readError) return { ok: false, error: readError.message };
  if (!fulfillment) return { ok: false, error: "Fulfillment not found." };
  if (fulfillment.order_id !== input.orderId) {
    return { ok: false, error: "Fulfillment does not belong to this order." };
  }

  const target = nextStateFor(fulfillment.state, input.action);
  if (!target) {
    return {
      ok: false,
      error: `Cannot ${input.action.replace("_", " ")} from state ${fulfillment.state}.`,
    };
  }

  const now = new Date().toISOString();

  // Update fulfillment.state.
  const { error: fulfillmentError } = await supabase
    .schema("commerce")
    .from("fulfillments")
    .update({ state: target })
    .eq("id", fulfillment.id);
  if (fulfillmentError)
    return { ok: false, error: fulfillmentError.message };

  // Stamp per-mode timestamps. Different modes have different ladders, so
  // we branch on fulfillment.type. Failures here are non-fatal: the
  // fulfillment + order state already moved.
  if (fulfillment.type === "pickup") {
    const update: Record<string, string | null> = {};
    if (input.action === "accept") update.accepted_at = now;
    if (input.action === "mark_ready") update.ready_at = now;
    if (input.action === "mark_completed") update.picked_up_at = now;
    if (input.action === "cancel") {
      update.canceled_at = now;
      if (input.cancelReason !== undefined)
        update.cancel_reason = input.cancelReason;
    }
    if (Object.keys(update).length) {
      await supabase
        .schema("commerce")
        .from("fulfillment_pickup_details")
        .update(update)
        .eq("fulfillment_id", fulfillment.id);
    }
  } else if (fulfillment.type === "delivery") {
    const update: Record<string, string | null> = {};
    if (input.action === "accept") update.accepted_at = now;
    if (input.action === "mark_ready") update.courier_assigned_at = now;
    if (input.action === "mark_completed") update.delivered_at = now;
    if (input.action === "cancel") {
      update.canceled_at = now;
      if (input.cancelReason !== undefined)
        update.cancel_reason = input.cancelReason;
    }
    if (Object.keys(update).length) {
      await supabase
        .schema("commerce")
        .from("fulfillment_delivery_details")
        .update(update)
        .eq("fulfillment_id", fulfillment.id);
    }
  } else if (fulfillment.type === "dine_in") {
    // Dine-in's only ladder field is closed_at on the details row.
    if (input.action === "mark_completed" || input.action === "cancel") {
      await supabase
        .schema("commerce")
        .from("fulfillment_dine_in_details")
        .update({ closed_at: now })
        .eq("fulfillment_id", fulfillment.id);
    }
  }

  // When the fulfillment reaches a terminal state, close the order too.
  if (target === "completed" || target === "canceled") {
    const orderState = target === "completed" ? "completed" : "canceled";
    const { error: orderError } = await supabase
      .schema("commerce")
      .from("orders")
      .update({ state: orderState, closed_at: now })
      .eq("id", input.orderId);
    if (orderError) return { ok: false, error: orderError.message };
  }

  revalidatePath(input.catalogPath);
  return { ok: true };
}

// State transition table. Returns the next fulfillment state for a given
// (current state, action) pair, or null if the transition is invalid.
function nextStateFor(
  current: string,
  action: OrderAction,
):
  | "reserved"
  | "prepared"
  | "completed"
  | "canceled"
  | null {
  if (action === "cancel") {
    if (current === "completed" || current === "canceled") return null;
    return "canceled";
  }
  if (action === "accept") {
    return current === "proposed" ? "reserved" : null;
  }
  if (action === "mark_ready") {
    if (current === "proposed") return "prepared"; // express: accept+ready
    if (current === "reserved") return "prepared";
    return null;
  }
  if (action === "mark_completed") {
    if (current === "prepared") return "completed";
    if (current === "reserved") return "completed"; // skip "ready"
    return null;
  }
  return null;
}
