import type { Metadata } from "next";

import { TmaBridge } from "./_components/tma-bridge";

export const metadata: Metadata = {
  title: "Krafta",
  // The Mini App entry is an auth handshake, never a public/indexable page.
  robots: { index: false, follow: false },
};

/**
 * The single Telegram Mini App entry. The shop is chosen by `startapp`
 * (read client-side from the signed initData), never from the URL path — so
 * one BotFather Main Mini App URL serves every merchant storefront.
 */
export default function TmaEntryPage() {
  return <TmaBridge />;
}
