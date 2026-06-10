"use client";

// KRA-43 / ADR 0005 §4 — the Publish step machine.
//
//   slug confirm → demo nudge (untouched seeds only) → register (anon only:
//   Google linkIdentity / email OTP, collision → claim handshake) →
//   publish_shop → celebration (live link + QR + Telegram order alerts).
//
// The Google leg is a full-page OAuth round-trip: pending state (final slug,
// optional claim code) survives in sessionStorage and the ?publish= search
// param; publish-banner.tsx resumes the machine on return.

import * as React from "react";
import { useRouter } from "next/navigation";
import { REGEXP_ONLY_DIGITS } from "input-otp";
import { Check, Copy, ExternalLink, Loader2, Send, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSeparator,
  InputOTPSlot,
} from "@/components/ui/input-otp";
import { Separator } from "@/components/ui/separator";
import { isValidSlug } from "@/lib/onboarding/slug";
import { signInWithEmail, verifyOtpCode } from "@/lib/auth/actions";

import {
  completeDraftClaim,
  getPublishPreflight,
  initiateDraftClaim,
  linkGoogleForPublish,
  publishShop,
  registerPublishEmail,
  removeDemoItems,
  verifyPublishOtp,
  type PublishPreflight,
  type PublishResult,
} from "./publish-actions";

export const PENDING_PUBLISH_KEY = "krafta.pending-publish";
export const PENDING_CLAIM_KEY = "krafta.pending-claim";

type Step =
  | "loading"
  | "slug"
  | "demo"
  | "register"
  | "otp"
  | "claim"
  | "claim-otp"
  | "publishing"
  | "live";

export function PublishDialog({
  orgSlug,
  catalogSlug,
  open,
  onOpenChange,
  resumeSlug,
}: {
  orgSlug: string;
  catalogSlug: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Set when returning from the Google OAuth round-trip (?publish=<slug>). */
  resumeSlug?: string;
}) {
  const router = useRouter();
  const [step, setStep] = React.useState<Step>("loading");
  const [preflight, setPreflight] = React.useState<PublishPreflight | null>(null);
  const [slug, setSlug] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [otp, setOtp] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [result, setResult] = React.useState<PublishResult | null>(null);
  const [copied, setCopied] = React.useState(false);
  const [host, setHost] = React.useState("");

  React.useEffect(() => {
    setHost(window.location.host);
  }, []);

  const doPublish = React.useCallback(
    async (orgId: string, finalSlug: string) => {
      setStep("publishing");
      setError(null);
      const res = await publishShop({
        orgId,
        finalSlug: finalSlug || undefined,
      });
      if ("error" in res) {
        setError(res.error);
        setStep("slug");
        return;
      }
      sessionStorage.removeItem(PENDING_PUBLISH_KEY);
      sessionStorage.removeItem(PENDING_CLAIM_KEY);
      setResult(res);
      setStep("live");
    },
    [],
  );

  // Load preflight when the dialog opens; resume straight into publishing
  // after the OAuth round-trip (the slug + demo decisions were made before
  // the redirect).
  React.useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setStep("loading");
    setError(null);
    void (async () => {
      const pf = await getPublishPreflight({ orgSlug, catalogSlug });
      if (cancelled) return;
      if ("error" in pf) {
        setError(pf.error);
        setStep("slug");
        return;
      }
      setPreflight(pf);
      setSlug(pf.suggestedSlug);
      if (resumeSlug !== undefined && !pf.isAnonymous) {
        void doPublish(pf.orgId, resumeSlug);
        return;
      }
      setStep("slug");
    })();
    return () => {
      cancelled = true;
    };
  }, [open, orgSlug, catalogSlug, resumeSlug, doPublish]);

  const advanceFromSlug = () => {
    if (!preflight) return;
    if (slug && !isValidSlug(slug)) {
      setError("Lowercase letters, digits and dashes only (3-64 characters).");
      return;
    }
    setError(null);
    if (preflight.demoItems.length > 0) setStep("demo");
    else advanceFromDemo();
  };

  const advanceFromDemo = () => {
    if (!preflight) return;
    setError(null);
    if (preflight.isAnonymous) setStep("register");
    else void doPublish(preflight.orgId, slug);
  };

  const handleRemoveDemo = async () => {
    if (!preflight) return;
    setBusy(true);
    const res = await removeDemoItems({
      catalogId: preflight.catalogId,
      itemIds: preflight.demoItems.map((i) => i.id),
    });
    setBusy(false);
    if ("error" in res) {
      setError(res.error);
      return;
    }
    router.refresh();
    setPreflight({ ...preflight, demoItems: [] });
    advanceFromDemo();
  };

  const handleGoogle = async () => {
    setBusy(true);
    setError(null);
    sessionStorage.setItem(PENDING_PUBLISH_KEY, slug);
    const next = `/dashboard/${orgSlug}/${catalogSlug}/items?publish=${encodeURIComponent(slug)}`;
    const res = await linkGoogleForPublish(next);
    if ("error" in res) {
      setBusy(false);
      sessionStorage.removeItem(PENDING_PUBLISH_KEY);
      setError(res.error);
      return;
    }
    window.location.assign(res.url);
  };

  const handleSendEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await registerPublishEmail(email.trim());
    setBusy(false);
    if ("collision" in res) {
      setStep("claim");
      return;
    }
    if ("error" in res) {
      setError(res.error);
      return;
    }
    setOtp("");
    setStep("otp");
  };

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!preflight) return;
    setBusy(true);
    setError(null);
    const res = await verifyPublishOtp(email.trim(), otp);
    setBusy(false);
    if ("error" in res) {
      setError(res.error);
      return;
    }
    void doPublish(preflight.orgId, slug);
  };

  // Collision path (D2): the email already has a Krafta account. Mint the
  // claim code FIRST (we are still the anon owner), then sign into the
  // existing account and redeem the code — the draft moves over.
  const handleClaimSend = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const claim = await initiateDraftClaim();
    if ("error" in claim) {
      setBusy(false);
      setError(claim.error);
      return;
    }
    sessionStorage.setItem(PENDING_CLAIM_KEY, claim.code);
    const res = await signInWithEmail(email.trim());
    setBusy(false);
    if (res && "error" in res && res.error) {
      setError(res.error);
      return;
    }
    setOtp("");
    setStep("claim-otp");
  };

  const handleClaimVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const signin = await verifyOtpCode(email.trim(), otp);
    if (signin && "error" in signin && signin.error) {
      setBusy(false);
      setError(signin.error);
      return;
    }
    const code = sessionStorage.getItem(PENDING_CLAIM_KEY);
    if (!code) {
      setBusy(false);
      setError("The claim expired — close this dialog and try again.");
      return;
    }
    const claimed = await completeDraftClaim(code);
    setBusy(false);
    if ("error" in claimed) {
      setError(claimed.error);
      return;
    }
    sessionStorage.removeItem(PENDING_CLAIM_KEY);
    if (!preflight) return;
    void doPublish(preflight.orgId, slug);
  };

  const handleCopy = async () => {
    if (!result) return;
    await navigator.clipboard.writeText(result.storefrontUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const finishToDashboard = () => {
    if (!result) return;
    onOpenChange(false);
    router.push(`/dashboard/${result.orgSlug}/${result.catalogSlug}/items`);
    router.refresh();
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        // After publish the old dashboard URL may be stale (slug renamed) —
        // closing the celebration routes to the new one instead.
        if (!next && step === "live") {
          finishToDashboard();
          return;
        }
        if (!busy && step !== "publishing") onOpenChange(next);
      }}
    >
      <DialogContent className="sm:max-w-md">
        {step === "loading" && (
          <>
            <DialogTitle className="sr-only">Preparing to publish</DialogTitle>
            <DialogDescription className="sr-only">
              Loading your shop details.
            </DialogDescription>
            <div className="flex items-center justify-center py-12">
              <Loader2 className="size-5 animate-spin text-muted-foreground" />
            </div>
          </>
        )}

        {step === "slug" && preflight && (
          <>
            <DialogHeader>
              <DialogTitle>Choose your shop link</DialogTitle>
              <DialogDescription>
                This is the address customers open and the QR code points to.
                It can&apos;t change after you publish.
              </DialogDescription>
            </DialogHeader>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                advanceFromSlug();
              }}
              className="flex flex-col gap-4"
            >
              <div className="flex flex-col gap-2">
                <Label htmlFor="publish-slug">Shop link</Label>
                <Input
                  id="publish-slug"
                  value={slug}
                  onChange={(e) => setSlug(e.target.value.toLowerCase())}
                  autoComplete="off"
                  spellCheck={false}
                  className="font-mono"
                />
                <p className="text-xs text-muted-foreground">
                  {host}/<span className="font-mono">{slug || "…"}</span>
                </p>
              </div>
              {error && (
                <p role="alert" className="text-sm text-destructive">
                  {error}
                </p>
              )}
              <Button type="submit" className="w-full">
                Continue
              </Button>
            </form>
          </>
        )}

        {step === "demo" && preflight && (
          <>
            <DialogHeader>
              <DialogTitle>You still have demo items</DialogTitle>
              <DialogDescription>
                These starter items haven&apos;t been edited. Customers could
                order them at the demo prices.
              </DialogDescription>
            </DialogHeader>
            <ul className="max-h-40 overflow-y-auto rounded-lg border px-3 py-2 text-sm">
              {preflight.demoItems.map((item) => (
                <li key={item.id} className="truncate py-1">
                  {item.name}
                </li>
              ))}
            </ul>
            {error && (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            )}
            <div className="flex flex-col gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={handleRemoveDemo}
                disabled={busy}
              >
                {busy ? (
                  <Loader2 className="animate-spin" />
                ) : (
                  <Trash2 className="size-4" />
                )}
                Remove demo items
              </Button>
              <Button type="button" onClick={advanceFromDemo} disabled={busy}>
                Keep them and publish
              </Button>
            </div>
          </>
        )}

        {step === "register" && (
          <>
            <DialogHeader>
              <DialogTitle>Create your account</DialogTitle>
              <DialogDescription>
                Registering keeps your shop yours — everything you built stays
                exactly as it is.
              </DialogDescription>
            </DialogHeader>
            <div className="flex flex-col gap-4">
              <Button
                type="button"
                variant="outline"
                className="w-full"
                onClick={handleGoogle}
                disabled={busy}
              >
                {busy ? <Loader2 className="animate-spin" /> : null}
                Continue with Google
              </Button>
              <div className="flex items-center gap-3">
                <Separator className="flex-1" />
                <span className="text-xs text-muted-foreground">
                  or with email
                </span>
                <Separator className="flex-1" />
              </div>
              <form onSubmit={handleSendEmail} className="flex flex-col gap-3">
                <div className="flex flex-col gap-2">
                  <Label htmlFor="publish-email">Email</Label>
                  <Input
                    id="publish-email"
                    type="email"
                    placeholder="you@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    autoComplete="email"
                    disabled={busy}
                  />
                </div>
                {error && (
                  <p role="alert" className="text-sm text-destructive">
                    {error}
                  </p>
                )}
                <Button type="submit" className="w-full" disabled={busy}>
                  {busy ? <Loader2 className="animate-spin" /> : <Send className="size-4" />}
                  Send code
                </Button>
              </form>
            </div>
          </>
        )}

        {(step === "otp" || step === "claim-otp") && (
          <>
            <DialogHeader>
              <DialogTitle>Enter the code</DialogTitle>
              <DialogDescription>
                We sent a 6-digit code to {email}.
              </DialogDescription>
            </DialogHeader>
            <form
              onSubmit={step === "otp" ? handleVerifyOtp : handleClaimVerify}
              className="flex flex-col items-center gap-4"
            >
              <InputOTP
                maxLength={6}
                pattern={REGEXP_ONLY_DIGITS}
                value={otp}
                onChange={setOtp}
                disabled={busy}
                autoFocus
                containerClassName="justify-center"
              >
                <InputOTPGroup className="*:data-[slot=input-otp-slot]:h-12 *:data-[slot=input-otp-slot]:w-10 *:data-[slot=input-otp-slot]:text-xl">
                  <InputOTPSlot index={0} />
                  <InputOTPSlot index={1} />
                  <InputOTPSlot index={2} />
                </InputOTPGroup>
                <InputOTPSeparator className="mx-1" />
                <InputOTPGroup className="*:data-[slot=input-otp-slot]:h-12 *:data-[slot=input-otp-slot]:w-10 *:data-[slot=input-otp-slot]:text-xl">
                  <InputOTPSlot index={3} />
                  <InputOTPSlot index={4} />
                  <InputOTPSlot index={5} />
                </InputOTPGroup>
              </InputOTP>
              {error && (
                <p role="alert" className="text-sm text-destructive">
                  {error}
                </p>
              )}
              <Button
                type="submit"
                className="w-full"
                disabled={busy || otp.length !== 6}
              >
                {busy ? <Loader2 className="animate-spin" /> : null}
                {step === "otp" ? "Verify and publish" : "Sign in and claim"}
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={busy}
                onClick={() => {
                  setOtp("");
                  setStep(step === "otp" ? "register" : "claim");
                }}
              >
                Use a different email
              </Button>
            </form>
          </>
        )}

        {step === "claim" && (
          <>
            <DialogHeader>
              <DialogTitle>This email already has an account</DialogTitle>
              <DialogDescription>
                Sign in to it and we&apos;ll bring this draft shop along —
                nothing you built is lost.
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleClaimSend} className="flex flex-col gap-3">
              <div className="flex flex-col gap-2">
                <Label htmlFor="claim-email">Email</Label>
                <Input
                  id="claim-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoComplete="email"
                  disabled={busy}
                />
              </div>
              {error && (
                <p role="alert" className="text-sm text-destructive">
                  {error}
                </p>
              )}
              <Button type="submit" className="w-full" disabled={busy}>
                {busy ? <Loader2 className="animate-spin" /> : <Send className="size-4" />}
                Send sign-in code
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={busy}
                onClick={() => setStep("register")}
              >
                Use a different email instead
              </Button>
            </form>
          </>
        )}

        {step === "publishing" && (
          <>
            <DialogTitle className="sr-only">Publishing</DialogTitle>
            <DialogDescription className="sr-only">
              Making your shop public.
            </DialogDescription>
            <div className="flex flex-col items-center gap-3 py-12">
              <Loader2 className="size-5 animate-spin text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
                Publishing your shop…
              </p>
            </div>
          </>
        )}

        {step === "live" && result && (
          <>
            <DialogHeader>
              <DialogTitle>Your shop is live</DialogTitle>
              <DialogDescription>
                Share the link or print the QR — customers can order right now.
              </DialogDescription>
            </DialogHeader>
            <div className="flex flex-col items-center gap-4">
              <div
                className="w-44 [&_svg]:h-auto [&_svg]:w-full"
                // Server-rendered by lib/qr/render.ts — trusted SVG.
                dangerouslySetInnerHTML={{ __html: result.qrSvg }}
              />
              <div className="flex w-full items-center gap-2">
                <code className="min-w-0 flex-1 truncate rounded-md border bg-muted px-3 py-2 font-mono text-sm">
                  {result.storefrontUrl}
                </code>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  onClick={handleCopy}
                  aria-label="Copy link"
                >
                  {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
                </Button>
              </div>
              <Button asChild variant="outline" className="w-full">
                <a href={result.storefrontUrl} target="_blank" rel="noreferrer">
                  <ExternalLink className="size-4" />
                  Open your storefront
                </a>
              </Button>
              <Separator />
              <div className="flex w-full flex-col gap-1">
                <p className="text-sm font-medium">
                  Don&apos;t miss your first order
                </p>
                <p className="text-sm text-muted-foreground">
                  Connect Telegram and new orders ping your phone the moment
                  they arrive.
                </p>
              </div>
              <div className="flex w-full flex-col gap-2">
                <Button asChild className="w-full">
                  <a
                    href={`/dashboard/${result.orgSlug}/${result.catalogSlug}/settings`}
                  >
                    Get order alerts in Telegram
                  </a>
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  className="w-full"
                  onClick={finishToDashboard}
                >
                  Maybe later — go to my dashboard
                </Button>
              </div>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
