"use client";

import { useState, useTransition } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  FieldSeparator,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSeparator,
  InputOTPSlot,
} from "@/components/ui/input-otp";
import { REGEXP_ONLY_DIGITS } from "input-otp";
import { signInWithEmail, verifyOtpCode, signInWithGoogle } from "@/lib/auth/actions";
import { toast } from "sonner";

type Step = "email" | "otp";

export function LoginForm({
  className,
  ...props
}: React.ComponentProps<"div">) {
  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [otpCode, setOtpCode] = useState("");
  const [isPending, startTransition] = useTransition();

  const handleEmailSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;

    startTransition(async () => {
      const result = await signInWithEmail(email);
      if (result.error) {
        toast.error(result.error);
      } else {
        toast.success("Check your email for the login link or code!");
        setStep("otp");
      }
    });
  };

  const handleOtpSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!otpCode.trim()) return;

    startTransition(async () => {
      const result = await verifyOtpCode(email, otpCode);
      if (result.error) {
        toast.error(result.error);
      } else {
        toast.success("Successfully logged in!");
        // Redirect will happen automatically via middleware or manual redirect
        window.location.href = "/dashboard";
      }
    });
  };

  const handleGoogleSignIn = () => {
    startTransition(async () => {
      const result = await signInWithGoogle();
      if (result?.error) {
        toast.error(result.error);
      }
      // If successful, user will be redirected to Google
    });
  };

  const handleBack = () => {
    setStep("email");
    setOtpCode("");
  };

  return (
    <div className={cn("flex flex-col gap-6", className)} {...props}>
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
          {step === "email" ? (
            <form onSubmit={handleEmailSubmit}>
              <FieldGroup>
                <Field>
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
                </Field>
                <FieldSeparator className="*:data-[slot=field-separator-content]:bg-card">
                  Or continue with email
                </FieldSeparator>
                <Field>
                  <FieldLabel htmlFor="email">Email</FieldLabel>
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
                </Field>
                <Field>
                  <Button type="submit" disabled={isPending} className="w-full">
                    {isPending ? "Sending..." : "Send magic link"}
                  </Button>
                  <FieldDescription className="text-center text-xs text-muted-foreground mt-2">
                    We&apos;ll send you a magic link and a one-time code
                  </FieldDescription>
                </Field>
              </FieldGroup>
            </form>
          ) : (
            <form onSubmit={handleOtpSubmit}>
              <FieldGroup>
                <Field className="flex flex-col items-center">
                  <FieldLabel htmlFor="otp" className="sr-only">Verification code</FieldLabel>
                  <InputOTP
                    id="otp"
                    maxLength={6}
                    pattern={REGEXP_ONLY_DIGITS}
                    value={otpCode}
                    onChange={(value) => setOtpCode(value)}
                    disabled={isPending}
                    containerClassName="justify-center"
                    autoFocus
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
                  <FieldDescription className="text-center text-xs text-muted-foreground mt-3">
                    Enter the 6-digit code from your email, or click the magic link
                  </FieldDescription>
                </Field>
                <Field>
                  <Button type="submit" disabled={isPending || otpCode.length !== 6} className="w-full">
                    {isPending ? "Verifying..." : "Verify code"}
                  </Button>
                </Field>
                <Field className="flex flex-col items-center gap-2">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={handleBack}
                    disabled={isPending}
                  >
                    ← Use a different email
                  </Button>
                  <Button
                    type="button"
                    variant="link"
                    size="sm"
                    onClick={handleEmailSubmit}
                    disabled={isPending}
                  >
                    Resend code
                  </Button>
                </Field>
              </FieldGroup>
            </form>
          )}
        </CardContent>
      </Card>
      <FieldDescription className="px-6 text-center text-xs">
        By continuing, you agree to our <a href="#" className="underline underline-offset-4 hover:text-primary">Terms of Service</a>{" "}
        and <a href="#" className="underline underline-offset-4 hover:text-primary">Privacy Policy</a>.
      </FieldDescription>
    </div>
  );
}
