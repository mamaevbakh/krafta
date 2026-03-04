"use client";

import { useState, useTransition } from "react";
import { signInWithEmail, signInWithGoogle, verifyOtpCode } from "@/lib/auth/actions";

type Step = "email" | "otp";

export function LoginForm({ next }: { next: string }) {
  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [otpCode, setOtpCode] = useState("");
  const [error, setError] = useState<string | null>(null);
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
      setMessage("Check your email for login link or OTP code.");
      setStep("otp");
    });
  };

  const handleGoogle = () => {
    startTransition(async () => {
      setError(null);
      const result = await signInWithGoogle(next);
      if (result.error) {
        setError(result.error);
        return;
      }
      if (result.url) {
        window.location.assign(result.url);
      }
    });
  };

  const handleOtp = () => {
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
    <div className="w-full max-w-md rounded-lg border border-zinc-800 bg-zinc-950 p-6">
      <h1 className="text-xl font-semibold">Sign in to Krafta</h1>
      <p className="mt-1 text-sm text-zinc-300">
        Use Google or email OTP to continue.
      </p>

      {error ? (
        <p className="mt-4 rounded bg-red-500/10 p-2 text-sm text-red-300">{error}</p>
      ) : null}
      {message ? (
        <p className="mt-4 rounded bg-emerald-500/10 p-2 text-sm text-emerald-300">{message}</p>
      ) : null}

      <div className="mt-4 flex flex-col gap-3">
        <button
          type="button"
          className="rounded bg-white px-3 py-2 text-sm font-medium text-black disabled:opacity-60"
          onClick={handleGoogle}
          disabled={isPending}
        >
          Continue with Google
        </button>

        {step === "email" ? (
          <>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="rounded border border-zinc-700 bg-black px-3 py-2 text-sm"
            />
            <button
              type="button"
              className="rounded bg-zinc-200 px-3 py-2 text-sm font-medium text-black disabled:opacity-60"
              disabled={!email || isPending}
              onClick={sendEmail}
            >
              Send magic link / OTP
            </button>
          </>
        ) : (
          <>
            <input
              type="text"
              inputMode="numeric"
              value={otpCode}
              onChange={(e) => setOtpCode(e.target.value)}
              placeholder="6-digit OTP"
              className="rounded border border-zinc-700 bg-black px-3 py-2 text-sm"
            />
            <button
              type="button"
              className="rounded bg-zinc-200 px-3 py-2 text-sm font-medium text-black disabled:opacity-60"
              disabled={otpCode.length < 6 || isPending}
              onClick={handleOtp}
            >
              Verify OTP
            </button>
            <button
              type="button"
              className="text-left text-xs text-zinc-400 underline"
              onClick={() => setStep("email")}
            >
              Use different email
            </button>
          </>
        )}
      </div>
    </div>
  );
}
