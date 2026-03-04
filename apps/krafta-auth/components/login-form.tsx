"use client";

import { useState, useTransition } from "react";
import { signInWithEmail, signInWithGoogle, verifyOtpCode } from "@/lib/auth/actions";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";

type Step = "email" | "otp";

export function LoginForm({
  next,
  initialError,
}: {
  next: string;
  initialError?: string | null;
}) {
  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [otpCode, setOtpCode] = useState("");
  const [error, setError] = useState<string | null>(initialError ?? null);
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const sendEmail = () => {
    startTransition(async () => {
      setError(null);
      setMessage(null);
      const result = await signInWithEmail(email, next);
      if (result.error) {
        setError(result.error);
        return;
      }
      setMessage("Check your email for the login link or code.");
      setStep("otp");
    });
  };

  const handleGoogleSignIn = () => {
    startTransition(async () => {
      setError(null);
      const result = await signInWithGoogle(next);
      if (result?.error) {
        setError(result.error);
        return;
      }
      if (result?.url) {
        window.location.assign(result.url);
      }
    });
  };

  const handleEmailSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!email.trim()) return;
    sendEmail();
  };

  const handleOtpSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!otpCode.trim()) return;

    startTransition(async () => {
      setError(null);
      const result = await verifyOtpCode(email, otpCode);
      if (result.error) {
        setError(result.error);
        return;
      }
      window.location.assign(next);
    });
  };

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader className="text-center">
          <CardTitle className="text-xl">
            {step === "email" ? "Welcome" : "Enter verification code"}
          </CardTitle>
          <CardDescription>
            {step === "email"
              ? "Sign in with your email or Google account"
              : `We sent a code to ${email}`}
          </CardDescription>
        </CardHeader>

        <CardContent>
          {error ? (
            <p className="mb-4 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </p>
          ) : null}

          {message ? (
            <p className="mb-4 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-700 dark:text-emerald-300">
              {message}
            </p>
          ) : null}

          {step === "email" ? (
            <form onSubmit={handleEmailSubmit} className="space-y-4">
              <Button
                variant="outline"
                type="button"
                onClick={handleGoogleSignIn}
                disabled={isPending}
                className="w-full"
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" className="size-5 mr-2">
                  <path
                    d="M12.48 10.92v3.28h7.84c-.24 1.84-.853 3.187-1.787 4.133-1.147 1.147-2.933 2.4-6.053 2.4-4.827 0-8.6-3.893-8.6-8.72s3.773-8.72 8.6-8.72c2.6 0 4.507 1.027 5.907 2.347l2.307-2.307C18.747 1.44 16.133 0 12.48 0 5.867 0 .307 5.387.307 12s5.56 12 12.173 12c3.573 0 6.267-1.173 8.373-3.36 2.16-2.16 2.84-5.213 2.84-7.667 0-.76-.053-1.467-.173-2.053H12.48z"
                    fill="currentColor"
                  />
                </svg>
                Continue with Google
              </Button>

              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <span className="w-full border-t" />
                </div>
                <div className="relative flex justify-center text-xs uppercase">
                  <span className="bg-card px-2 text-muted-foreground">or continue with email</span>
                </div>
              </div>

              <div className="space-y-2">
                <label htmlFor="email" className="text-sm font-medium">Email</label>
                <Input
                  id="email"
                  type="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  disabled={isPending}
                  autoComplete="email"
                />
              </div>

              <Button type="submit" disabled={isPending} className="w-full">
                {isPending ? "Sending..." : "Send magic link"}
              </Button>

              <p className="text-center text-xs text-muted-foreground">
                We&apos;ll send you a magic link and a one-time code
              </p>
            </form>
          ) : (
            <form onSubmit={handleOtpSubmit} className="space-y-4">
              <div className="space-y-2">
                <label htmlFor="otp" className="text-sm font-medium">Verification code</label>
                <Input
                  id="otp"
                  type="text"
                  inputMode="numeric"
                  value={otpCode}
                  onChange={(e) => setOtpCode(e.target.value)}
                  placeholder="6-digit code"
                  maxLength={6}
                  autoFocus
                  disabled={isPending}
                  className="h-11 text-center text-lg tracking-[0.3em]"
                />
              </div>

              <Button type="submit" disabled={isPending || otpCode.length !== 6} className="w-full">
                {isPending ? "Verifying..." : "Verify code"}
              </Button>

              <div className="flex flex-col items-center gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setStep("email");
                    setOtpCode("");
                  }}
                  disabled={isPending}
                >
                  ← Use a different email
                </Button>
                <Button
                  type="button"
                  variant="link"
                  size="sm"
                  onClick={sendEmail}
                  disabled={isPending}
                >
                  Resend code
                </Button>
              </div>
            </form>
          )}
        </CardContent>
      </Card>

      <p className="px-6 text-center text-xs text-muted-foreground">
        By continuing, you agree to our Terms of Service and Privacy Policy.
      </p>
    </div>
  );
}
