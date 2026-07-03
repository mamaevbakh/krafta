"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * Shared new-order chime mute state, keyed per catalog and persisted in
 * localStorage. The alert lives at the dashboard-layout level now (rings on
 * every page), and the mute toggles on Orders / Overview must stay in sync
 * with it within the same tab — so a toggle dispatches a custom event that
 * every consumer of this hook (including the alert provider) listens for.
 * `storage` events cover cross-tab sync.
 */
const EVENT = "krafta:chime-mute";

export function chimeMuteKey(catalogId: string): string {
  return `krafta:orders:chime-muted:${catalogId}`;
}

export function useChimeMute(catalogId: string) {
  const [muted, setMuted] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const key = chimeMuteKey(catalogId);
    const read = () => setMuted(window.localStorage.getItem(key) === "1");
    read();
    const onStorage = (e: StorageEvent) => {
      if (e.key === key) read();
    };
    window.addEventListener("storage", onStorage);
    window.addEventListener(EVENT, read);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener(EVENT, read);
    };
  }, [catalogId]);

  const toggle = useCallback(() => {
    if (typeof window === "undefined") return;
    const key = chimeMuteKey(catalogId);
    const next = window.localStorage.getItem(key) !== "1";
    window.localStorage.setItem(key, next ? "1" : "0");
    window.dispatchEvent(new Event(EVENT));
    setMuted(next);
  }, [catalogId]);

  return { muted, toggle };
}
