"use client";

import * as React from "react";

/**
 * TmaShareContext — carries the shop's Telegram Mini App deep link + name down
 * to the header's share button, so it doesn't have to be threaded through the
 * four header variants + the layout registry. The storefront layout (a server
 * component) computes the deep link from TELEGRAM_BOT_USERNAME + the catalog
 * slug and provides it here; null when no platform bot is configured.
 */
export type TmaShare = { deepLink: string; shopName: string } | null;

const TmaShareContext = React.createContext<TmaShare>(null);

export function TmaShareProvider({
  value,
  children,
}: {
  value: TmaShare;
  children: React.ReactNode;
}) {
  return (
    <TmaShareContext.Provider value={value}>
      {children}
    </TmaShareContext.Provider>
  );
}

export function useTmaShare(): TmaShare {
  return React.useContext(TmaShareContext);
}
