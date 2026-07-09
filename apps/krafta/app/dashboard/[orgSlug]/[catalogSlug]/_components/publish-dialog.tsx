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
import {
  TelegramLoginButton,
  type TelegramAuthPayload,
} from "@/components/telegram-login-button";
import { isValidSlug } from "@/lib/onboarding/slug";
import { createClient } from "@/lib/supabase/client";
import { signInWithEmail } from "@/lib/auth/actions";
import { useT } from "@/lib/locales/dashboard/context";

import {
  completeDraftClaim,
  getPublishPreflight,
  initiateDraftClaim,
  linkGoogleForPublish,
  publishShop,
  registerPublishEmail,
  registerPublishTelegram,
  removeDemoItems,
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
  const t = useT();
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
      setError(t("activation.publish.slug_invalid"));
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

  // Telegram register (KRA-46): the widget callback hands us the signed
  // payload in-page — one server action attaches the identity to the anon
  // user (or claims the draft into an existing account on collision) and the
  // machine proceeds straight to publish. No redirect, no resume state.
  const handleTelegram = async (payload: TelegramAuthPayload) => {
    if (!preflight) return;
    setBusy(true);
    setError(null);
    const res = await registerPublishTelegram(payload);
    if ("error" in res) {
      setBusy(false);
      setError(res.error);
      return;
    }
    // Install the session in the BROWSER: the attach flipped is_anonymous on
    // the user row, and publish_shop's guards read the JWT claim, so the
    // token must be re-minted before publishing. Doing this client-side is
    // load-bearing — a cookie write inside the server action would make
    // Next.js re-render the current route, and that re-render races the
    // publish_shop slug rename: when it loses, the OLD /dashboard/[slug]
    // route 404s and unmounts this dialog mid-celebration. (Same reason
    // there's no router.refresh() here; finishToDashboard routes to the new
    // slugs once the merchant leaves the dialog.)
    const supabase = createClient();
    const { error: sessionErr } = res.session
      ? await supabase.auth.setSession(res.session)
      : await supabase.auth.refreshSession();
    setBusy(false);
    if (sessionErr) {
      setError(t("activation.error.session_refresh"));
      return;
    }
    void doPublish(preflight.orgId, slug);
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
    // Verify the OTP on the BROWSER client so the new session's cookies are
    // written client-side — same race as handleTelegram: a cookie write
    // inside a server action re-renders the current route, and that render
    // races the publish_shop slug rename into a 404 that unmounts this
    // dialog mid-celebration. Anon → email conversion confirms as an email
    // CHANGE on the existing user (the uid must survive); some project
    // configs issue plain 'email' OTPs instead — try both before failing.
    const supabase = createClient();
    const change = await supabase.auth.verifyOtp({
      email: email.trim(),
      token: otp,
      type: "email_change",
    });
    const verified =
      !change.error && change.data.user
        ? change
        : await supabase.auth.verifyOtp({
            email: email.trim(),
            token: otp,
            type: "email",
          });
    setBusy(false);
    if (verified.error || !verified.data.user) {
      setError(
        change.error?.message ??
          verified.error?.message ??
          t("activation.error.verification_failed"),
      );
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
    // Sign into the existing account on the BROWSER client (not the shared
    // verifyOtpCode server action — that writes session cookies inside the
    // action and re-renders the current route, racing the publish_shop slug
    // rename; see handleVerifyOtp). completeDraftClaim below already runs
    // under the new session: the client-side cookie write rides along on its
    // request.
    const supabase = createClient();
    const signin = await supabase.auth.verifyOtp({
      email: email.trim(),
      token: otp,
      type: "email",
    });
    if (signin.error || !signin.data.session) {
      setBusy(false);
      setError(signin.error?.message ?? t("activation.error.verification_failed"));
      return;
    }
    const code = sessionStorage.getItem(PENDING_CLAIM_KEY);
    if (!code) {
      setBusy(false);
      setError(t("activation.claim.expired"));
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
            <DialogTitle className="sr-only">
              {t("activation.publish.preparing_title")}
            </DialogTitle>
            <DialogDescription className="sr-only">
              {t("activation.publish.preparing_desc")}
            </DialogDescription>
            <div className="flex items-center justify-center py-12">
              <Loader2 className="size-5 animate-spin text-muted-foreground" />
            </div>
          </>
        )}

        {step === "slug" && preflight && (
          <>
            <DialogHeader>
              <DialogTitle>{t("activation.publish.slug_title")}</DialogTitle>
              <DialogDescription>
                {t("activation.publish.slug_desc")}
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
                <Label htmlFor="publish-slug">
                  {t("activation.publish.slug_label")}
                </Label>
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
                {t("common.continue")}
              </Button>
            </form>
          </>
        )}

        {step === "demo" && preflight && (
          <>
            <DialogHeader>
              <DialogTitle>{t("activation.demo.title")}</DialogTitle>
              <DialogDescription>
                {t("activation.demo.desc")}
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
                {t("activation.demo.remove")}
              </Button>
              <Button type="button" onClick={advanceFromDemo} disabled={busy}>
                {t("activation.demo.keep")}
              </Button>
            </div>
          </>
        )}

        {step === "register" && (
          <>
            <DialogHeader>
              <DialogTitle>{t("activation.register.title")}</DialogTitle>
              <DialogDescription>
                {t("activation.register.desc")}
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
                {t("activation.register.google")}
              </Button>
              {preflight?.telegramBotUsername && (
                <TelegramLoginButton
                  botUsername={preflight.telegramBotUsername}
                  onAuth={(payload) => void handleTelegram(payload)}
                  disabled={busy}
                />
              )}
              <div className="flex items-center gap-3">
                <Separator className="flex-1" />
                <span className="text-xs text-muted-foreground">
                  {t("activation.register.or_email")}
                </span>
                <Separator className="flex-1" />
              </div>
              <form onSubmit={handleSendEmail} className="flex flex-col gap-3">
                <div className="flex flex-col gap-2">
                  <Label htmlFor="publish-email">{t("activation.email")}</Label>
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
                  {t("activation.register.send_code")}
                </Button>
              </form>
            </div>
          </>
        )}

        {(step === "otp" || step === "claim-otp") && (
          <>
            <DialogHeader>
              <DialogTitle>{t("activation.otp.title")}</DialogTitle>
              <DialogDescription>
                {t("activation.otp.desc", { email })}
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
                {step === "otp"
                  ? t("activation.otp.verify_publish")
                  : t("activation.otp.signin_claim")}
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
                {t("activation.otp.different_email")}
              </Button>
            </form>
          </>
        )}

        {step === "claim" && (
          <>
            <DialogHeader>
              <DialogTitle>{t("activation.claim.title")}</DialogTitle>
              <DialogDescription>
                {t("activation.claim.desc")}
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleClaimSend} className="flex flex-col gap-3">
              <div className="flex flex-col gap-2">
                <Label htmlFor="claim-email">{t("activation.email")}</Label>
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
                {t("activation.claim.send_code")}
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={busy}
                onClick={() => setStep("register")}
              >
                {t("activation.claim.different_email")}
              </Button>
            </form>
          </>
        )}

        {step === "publishing" && (
          <>
            <DialogTitle className="sr-only">
              {t("activation.publishing.title")}
            </DialogTitle>
            <DialogDescription className="sr-only">
              {t("activation.publishing.desc")}
            </DialogDescription>
            <div className="flex flex-col items-center gap-3 py-12">
              <Loader2 className="size-5 animate-spin text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
                {t("activation.publishing.message")}
              </p>
            </div>
          </>
        )}

        {step === "live" && result && (
          <>
            <DialogHeader>
              <DialogTitle>{t("activation.live.title")}</DialogTitle>
              <DialogDescription>
                {t("activation.live.desc")}
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
                  aria-label={t("activation.live.copy_aria")}
                >
                  {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
                </Button>
              </div>
              <Button asChild variant="outline" className="w-full">
                <a href={result.storefrontUrl} target="_blank" rel="noreferrer">
                  <ExternalLink className="size-4" />
                  {t("activation.live.open_storefront")}
                </a>
              </Button>
              <Separator />
              <div className="flex w-full flex-col gap-1">
                <p className="text-sm font-medium">
                  {t("activation.live.first_order_title")}
                </p>
                <p className="text-sm text-muted-foreground">
                  {t("activation.live.first_order_desc")}
                </p>
              </div>
              <div className="flex w-full flex-col gap-2">
                <Button asChild className="w-full">
                  <a
                    href={`/dashboard/${result.orgSlug}/${result.catalogSlug}/settings`}
                  >
                    {t("activation.checklist.step.alerts")}
                  </a>
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  className="w-full"
                  onClick={finishToDashboard}
                >
                  {t("activation.live.maybe_later")}
                </Button>
              </div>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
