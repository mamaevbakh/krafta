"use client";

// KRA-42 wizard PR3 — "Secure your shop" (the anon-session SPOF mitigation).
//
// Until a merchant registers, their entire shop lives in one anonymous
// session cookie — cleared cookies, a different browser, or a "free up
// space" sweep loses it, and we have no way to reach them. This dialog lets
// them attach a real identity (Telegram / email / Google) WITHOUT publishing
// — the same identity-attach the Publish flow runs, minus the slug rename
// and the live step.
//
// It deliberately reuses the publish-actions (the tested, method-split upgrade
// APIs) but leaves publish-dialog.tsx untouched: that file's "session install
// stays in the browser" race fix is load-bearing and recently landed. Here
// there is no publish_shop rename to race, so the browser-side session install
// is just defensive consistency — and the terminal action is a plain refresh,
// which flips the checklist's "Secure your shop" row to done.

import * as React from "react";
import { useRouter } from "next/navigation";
import { REGEXP_ONLY_DIGITS } from "input-otp";
import { Check, Loader2, Send, ShieldCheck } from "lucide-react";

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
import { createClient } from "@/lib/supabase/client";
import { signInWithEmail } from "@/lib/auth/actions";
import { useT } from "@/lib/locales/dashboard/context";

import {
  completeDraftClaim,
  initiateDraftClaim,
  linkGoogleForPublish,
  registerPublishEmail,
  registerPublishTelegram,
} from "./publish-actions";

const PENDING_CLAIM_KEY = "krafta.pending-claim";

type Step = "register" | "otp" | "claim" | "claim-otp" | "done";

export function SecureAccountDialog({
  orgSlug,
  catalogSlug,
  telegramBotUsername,
  open,
  onOpenChange,
}: {
  orgSlug: string;
  catalogSlug: string;
  telegramBotUsername: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useT();
  const router = useRouter();
  const [step, setStep] = React.useState<Step>("register");
  const [email, setEmail] = React.useState("");
  const [otp, setOtp] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  // Reset to the first step whenever the dialog reopens.
  React.useEffect(() => {
    if (open) {
      setStep("register");
      setOtp("");
      setError(null);
    }
  }, [open]);

  const handleGoogle = async () => {
    setBusy(true);
    setError(null);
    // No pending-publish marker and no ?publish= param: returning from the
    // OAuth round-trip just lands back on the dashboard, now registered, and
    // the server re-derives the checklist row as done. linkGoogleForPublish
    // is a generic linkIdentity wrapper despite the name.
    const next = `/dashboard/${orgSlug}/${catalogSlug}/items`;
    const res = await linkGoogleForPublish(next);
    if ("error" in res) {
      setBusy(false);
      setError(res.error);
      return;
    }
    window.location.assign(res.url);
  };

  const handleTelegram = async (payload: TelegramAuthPayload) => {
    setBusy(true);
    setError(null);
    const res = await registerPublishTelegram(payload);
    if ("error" in res) {
      setBusy(false);
      setError(res.error);
      return;
    }
    // The attach flipped is_anonymous on the user row; install the re-minted
    // session in the browser so the next request carries a registered JWT.
    const supabase = createClient();
    const { error: sessionErr } = res.session
      ? await supabase.auth.setSession(res.session)
      : await supabase.auth.refreshSession();
    setBusy(false);
    if (sessionErr) {
      setError(t("activation.error.session_refresh"));
      return;
    }
    setStep("done");
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
    setBusy(true);
    setError(null);
    // Anon → email is an email CHANGE on the existing user (uid must survive);
    // some project configs issue a plain 'email' OTP instead — try both.
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
    setStep("done");
  };

  // Collision (D2): the email already has a Krafta account. Mint the claim
  // code FIRST (while still the anon owner), sign into the existing account,
  // redeem — the draft moves over, and the merchant ends up registered AND
  // owning the shop.
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
      setError(t("activation.secure.transfer_expired"));
      return;
    }
    const claimed = await completeDraftClaim(code);
    setBusy(false);
    if ("error" in claimed) {
      setError(claimed.error);
      return;
    }
    sessionStorage.removeItem(PENDING_CLAIM_KEY);
    setStep("done");
  };

  // Refresh on close (not on reaching "done"): the merchant sees the
  // confirmation, and the checklist re-derives the now-secured state once
  // they dismiss — avoiding the case where securing the last open item
  // unmounts the whole checklist (and this dialog with it) mid-celebration.
  const handleOpenChange = (next: boolean) => {
    if (busy) return;
    if (!next && step === "done") {
      onOpenChange(false);
      router.refresh();
      return;
    }
    onOpenChange(next);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        {step === "register" && (
          <>
            <DialogHeader>
              <DialogTitle>{t("activation.secure.title")}</DialogTitle>
              <DialogDescription>
                {t("activation.secure.desc")}
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
              {telegramBotUsername && (
                <TelegramLoginButton
                  botUsername={telegramBotUsername}
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
                  <Label htmlFor="secure-email">{t("activation.email")}</Label>
                  <Input
                    id="secure-email"
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
                  ? t("activation.secure.verify")
                  : t("activation.secure.signin_transfer")}
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
                <Label htmlFor="secure-claim-email">{t("activation.email")}</Label>
                <Input
                  id="secure-claim-email"
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

        {step === "done" && (
          <>
            <DialogHeader>
              <DialogTitle>{t("activation.secured.title")}</DialogTitle>
              <DialogDescription>
                {t("activation.secured.desc")}
              </DialogDescription>
            </DialogHeader>
            <div className="flex flex-col items-center gap-4 py-2">
              <span className="flex size-12 items-center justify-center rounded-full bg-muted">
                <ShieldCheck className="size-6" />
              </span>
              <Button
                type="button"
                className="w-full"
                onClick={() => handleOpenChange(false)}
              >
                <Check className="size-4" />
                {t("common.done")}
              </Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
