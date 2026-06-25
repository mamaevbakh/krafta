"use client";

import dynamic from "next/dynamic";
import type { StorefrontAssistantProps } from "./storefront-assistant";

// Client-only + lazy: the chat bundle (useChat, transport) only loads for shops
// that have the assistant enabled, and only when the dialog mounts.
const StorefrontAssistantDynamic = dynamic(
  () =>
    import("./storefront-assistant").then(
      (module) => module.StorefrontAssistant,
    ),
  { ssr: false },
);

export function StorefrontAssistantLazy(props: StorefrontAssistantProps) {
  return <StorefrontAssistantDynamic {...props} />;
}
