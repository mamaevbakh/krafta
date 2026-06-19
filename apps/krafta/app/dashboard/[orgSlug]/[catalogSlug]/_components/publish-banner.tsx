"use client";

// KRA-43 / ADR 0005 §4 — draft-state banner + Publish entry point.
//
// Mounted in the catalog layout whenever the venue is paused. Also owns the
// two cross-redirect resume paths:
//   ?publish=<slug>  — return leg of the Google linkIdentity round-trip; the
//                      dialog reopens and publishes immediately.
//   pending claim    — best-effort recovery when a Google collision bounced
//                      the merchant through a normal sign-in: if a claim code
//                      is stashed and the session is now registered, redeem it
//                      and land on the claimed shop ready to publish.

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Megaphone } from "lucide-react";

import { Button } from "@/components/ui/button";

import { completeDraftClaim } from "./publish-actions";
import {
  PENDING_CLAIM_KEY,
  PENDING_PUBLISH_KEY,
  PublishDialog,
} from "./publish-dialog";

export function PublishBanner({
  orgSlug,
  catalogSlug,
  isAnonymousUser,
}: {
  orgSlug: string;
  catalogSlug: string;
  isAnonymousUser: boolean;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const resumeSlug = searchParams.get("publish") ?? undefined;
  const [open, setOpen] = React.useState(resumeSlug !== undefined);

  // Post-collision claim recovery (see header comment).
  React.useEffect(() => {
    if (isAnonymousUser) return;
    const code = sessionStorage.getItem(PENDING_CLAIM_KEY);
    if (!code) return;
    void completeDraftClaim(code).then((res) => {
      sessionStorage.removeItem(PENDING_CLAIM_KEY);
      if ("error" in res) return; // expired or already redeemed — drop it
      const pendingSlug = sessionStorage.getItem(PENDING_PUBLISH_KEY) ?? "";
      router.push(
        `/dashboard/${res.orgSlug}/${res.catalogSlug}/items?publish=${encodeURIComponent(pendingSlug)}`,
      );
    });
  }, [isAnonymousUser, router]);

  return (
    <>
      <div className="flex items-center justify-between gap-3 border-b bg-background px-6 py-2.5">
        <p className="min-w-0 truncate text-sm text-muted-foreground">
          <span className="font-medium text-foreground">Draft</span>
          <span className="hidden sm:inline">
            {" "}
            — only you can see your shop.
          </span>
        </p>
        <Button type="button" size="sm" onClick={() => setOpen(true)}>
          <Megaphone className="size-4" />
          Publish
        </Button>
      </div>
      <PublishDialog
        orgSlug={orgSlug}
        catalogSlug={catalogSlug}
        open={open}
        onOpenChange={setOpen}
        resumeSlug={resumeSlug}
      />
    </>
  );
}
