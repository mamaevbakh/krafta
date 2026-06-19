"use client";

import * as React from "react";
import { Share2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useTmaShare } from "@/lib/telegram/tma-share-context";
import { haptic, isTelegramMiniApp, shareToChat } from "@/lib/telegram/webapp";
import { cn } from "@/lib/utils";

/**
 * TelegramShareButton — forwards THIS shop's Mini App deep link into a Telegram
 * chat via the native share sheet. Rendered in the header utility cluster as a
 * sibling to ModeToggle / LocaleSwitcher (same rounded-full bg-muted icon
 * button) so the three read as one family.
 *
 * Telegram-only: returns null on the public web (forwarding a t.me/startapp
 * link there makes no sense) and when no deep link is configured. The link
 * comes from TmaShareContext, set by the storefront layout.
 */
export function TelegramShareButton({ className }: { className?: string }) {
  const share = useTmaShare();
  const [inTelegram, setInTelegram] = React.useState(false);

  React.useEffect(() => {
    setInTelegram(isTelegramMiniApp());
  }, []);

  if (!inTelegram || !share) return null;

  return (
    <Button
      type="button"
      size="icon"
      variant="outline"
      aria-label="Share this shop"
      onClick={() => {
        haptic.impact("light");
        shareToChat(share.deepLink, share.shopName);
      }}
      className={cn(
        "rounded-full bg-muted text-foreground hover:bg-muted/80",
        className,
      )}
    >
      <Share2 className="size-4" aria-hidden />
    </Button>
  );
}
