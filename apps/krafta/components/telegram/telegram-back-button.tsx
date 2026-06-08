"use client";

import * as React from "react";

import { pushBackHandler } from "@/lib/telegram/webapp";

/**
 * Shows the Telegram BackButton while `active`, routing its click to `onBack`.
 * Ref-stable: the handler always calls the latest `onBack` without re-pushing
 * the stack each render. No-ops outside Telegram. Render it (returns null) next
 * to any overlay whose open state should own the Back control.
 */
export function useTelegramBackButton(active: boolean, onBack: () => void) {
  const onBackRef = React.useRef(onBack);
  React.useEffect(() => {
    onBackRef.current = onBack;
  });

  React.useEffect(() => {
    if (!active) return;
    return pushBackHandler(() => onBackRef.current());
  }, [active]);
}

export function TelegramBackButton({
  active,
  onBack,
}: {
  active: boolean;
  onBack: () => void;
}) {
  useTelegramBackButton(active, onBack);
  return null;
}
