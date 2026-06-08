"use client";

import * as React from "react";

import { getWebApp } from "@/lib/telegram/webapp";

export type MainButtonState = {
  visible: boolean;
  text: string;
  onClick: () => void;
  /** Show the spinner + disable taps (e.g. while placing an order). */
  progress?: boolean;
};

/**
 * Drives the Telegram MainButton (the native bottom CTA) from declarative
 * state. Pass `null` to leave it untouched. The click handler is ref-stable, so
 * updating `onClick` every render doesn't churn Telegram's listener. Hides the
 * button on unmount. No-ops outside Telegram.
 *
 * Single-owner: only one component should drive the MainButton at a time.
 */
export function useTelegramMainButton(state: MainButtonState | null) {
  const onClickRef = React.useRef<() => void>(() => {});
  React.useEffect(() => {
    if (state) onClickRef.current = state.onClick;
  });

  // Wire the click once.
  React.useEffect(() => {
    const mb = getWebApp()?.MainButton;
    if (!mb) return;
    const handler = () => onClickRef.current();
    mb.onClick(handler);
    return () => mb.offClick(handler);
  }, []);

  const visible = state?.visible ?? false;
  const text = state?.text ?? "";
  const progress = state?.progress ?? false;

  React.useEffect(() => {
    const mb = getWebApp()?.MainButton;
    if (!mb) return;
    if (visible) {
      mb.setParams({ text, is_visible: true, is_active: !progress });
      if (progress) mb.showProgress(true);
      else mb.hideProgress();
    } else {
      mb.hideProgress();
      mb.hide();
    }
  }, [visible, text, progress]);

  // Always release the button when the owner unmounts.
  React.useEffect(() => {
    return () => {
      const mb = getWebApp()?.MainButton;
      mb?.hideProgress();
      mb?.hide();
    };
  }, []);
}
