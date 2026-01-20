import type { SupabaseClient } from "@supabase/supabase-js";

type BroadcastPayload = Record<string, unknown>;

function subscribeOnce(channel: any, timeoutMs: number) {
  return new Promise<string>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("realtime_subscribe_timeout")), timeoutMs);

    channel.subscribe((status: string) => {
      if (status === "SUBSCRIBED") {
        clearTimeout(timeout);
        resolve(status);
      }

      if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
        clearTimeout(timeout);
        reject(new Error(`realtime_subscribe_${status.toLowerCase()}`));
      }
    });
  });
}

export async function broadcastCheckoutUpdate(
  supabase: SupabaseClient,
  publicToken: string,
  payload: BroadcastPayload = {}
) {
  const channelName = `checkout:${publicToken}`;
  const channel = supabase.channel(channelName, {
    config: {
      broadcast: {
        ack: false,
      },
    },
  });

  try {
    await subscribeOnce(channel, 2500);

    const result = await channel.send({
      type: "broadcast",
      event: "checkout_updated",
      payload,
    });

    if (result !== "ok") {
      throw new Error(`realtime_send_${result}`);
    }
  } finally {
    await supabase.removeChannel(channel);
  }
}
