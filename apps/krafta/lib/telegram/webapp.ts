/**
 * webapp.ts — thin, SSR-safe access to the Telegram Mini App SDK
 * (`window.Telegram.WebApp`, loaded by the /tma bridge).
 *
 * Everything here no-ops gracefully when not running inside Telegram, so the
 * same components render on the public web storefront unchanged. Pure
 * functions (no React) — import and call from any client component; the
 * surfaces that need to react to state use the hooks in components/telegram/*.
 */

export type TgInsets = { top: number; bottom: number; left: number; right: number };
type HapticStyle = "light" | "medium" | "heavy" | "rigid" | "soft";
type NotificationType = "error" | "success" | "warning";

type TgMainButton = {
  setText: (text: string) => void;
  setParams: (params: {
    text?: string;
    color?: string;
    text_color?: string;
    is_active?: boolean;
    is_visible?: boolean;
  }) => void;
  show: () => void;
  hide: () => void;
  enable: () => void;
  disable: () => void;
  showProgress: (leaveActive?: boolean) => void;
  hideProgress: () => void;
  onClick: (cb: () => void) => void;
  offClick: (cb: () => void) => void;
};

type TgBackButton = {
  show: () => void;
  hide: () => void;
  onClick: (cb: () => void) => void;
  offClick: (cb: () => void) => void;
};

export type TelegramWebApp = {
  initData: string;
  version: string;
  colorScheme?: "light" | "dark";
  themeParams?: Record<string, string>;
  isFullscreen?: boolean;
  ready: () => void;
  expand?: () => void;
  requestFullscreen?: () => void;
  exitFullscreen?: () => void;
  disableVerticalSwipes?: () => void;
  enableClosingConfirmation?: () => void;
  disableClosingConfirmation?: () => void;
  openTelegramLink?: (url: string) => void;
  isVersionAtLeast?: (version: string) => boolean;
  onEvent?: (event: string, cb: () => void) => void;
  offEvent?: (event: string, cb: () => void) => void;
  safeAreaInset?: TgInsets;
  contentSafeAreaInset?: TgInsets;
  HapticFeedback?: {
    impactOccurred: (style: HapticStyle) => void;
    notificationOccurred: (type: NotificationType) => void;
    selectionChanged: () => void;
  };
  MainButton?: TgMainButton;
  BackButton?: TgBackButton;
};

export function getWebApp(): TelegramWebApp | null {
  if (typeof window === "undefined") return null;
  return (
    (window as unknown as { Telegram?: { WebApp?: TelegramWebApp } }).Telegram
      ?.WebApp ?? null
  );
}

/** True only inside a real Telegram Mini App launch (signed initData present). */
export function isTelegramMiniApp(): boolean {
  const wa = getWebApp();
  return !!wa && typeof wa.initData === "string" && wa.initData.length > 0;
}

export function tgVersionAtLeast(version: string): boolean {
  return getWebApp()?.isVersionAtLeast?.(version) ?? false;
}

/** Telegram's current light/dark scheme, or null when off-Telegram. */
export function getColorScheme(): "light" | "dark" | null {
  const s = getWebApp()?.colorScheme;
  return s === "light" || s === "dark" ? s : null;
}

/**
 * Open Telegram's native share sheet to forward `url` (with an optional
 * caption) into a chat or channel. No-op off-Telegram / on clients without
 * openTelegramLink support.
 */
export function shareToChat(url: string, text?: string): void {
  const wa = getWebApp();
  if (!wa?.openTelegramLink) return;
  const share =
    `https://t.me/share/url?url=${encodeURIComponent(url)}` +
    (text ? `&text=${encodeURIComponent(text)}` : "");
  try {
    wa.openTelegramLink(share);
  } catch {
    /* unsupported client */
  }
}

/** Fire-and-forget haptics; no-ops off-Telegram or on clients without support. */
export const haptic = {
  impact(style: HapticStyle = "light") {
    try {
      getWebApp()?.HapticFeedback?.impactOccurred(style);
    } catch {
      /* unsupported client */
    }
  },
  notify(type: NotificationType) {
    try {
      getWebApp()?.HapticFeedback?.notificationOccurred(type);
    } catch {
      /* unsupported client */
    }
  },
  selection() {
    try {
      getWebApp()?.HapticFeedback?.selectionChanged();
    } catch {
      /* unsupported client */
    }
  },
};

// ── BackButton stack ──────────────────────────────────────────────────────
// Multiple overlays (item sheet, cart drawer) may each want the hardware-style
// Back control. A module-level stack shows it whenever ≥1 overlay is open and
// routes the click to the topmost handler, so nesting unwinds correctly.

const backStack: Array<() => void> = [];
let backWired = false;

function syncBackButton() {
  const bb = getWebApp()?.BackButton;
  if (!bb) return;
  if (backStack.length > 0) bb.show();
  else bb.hide();
}

function onBackClicked() {
  backStack[backStack.length - 1]?.();
}

/** Push a Back handler; returns a disposer that pops it. */
export function pushBackHandler(handler: () => void): () => void {
  const bb = getWebApp()?.BackButton;
  if (!bb) return () => {};
  if (!backWired) {
    bb.onClick(onBackClicked);
    backWired = true;
  }
  backStack.push(handler);
  syncBackButton();
  return () => {
    const i = backStack.lastIndexOf(handler);
    if (i >= 0) backStack.splice(i, 1);
    syncBackButton();
  };
}
