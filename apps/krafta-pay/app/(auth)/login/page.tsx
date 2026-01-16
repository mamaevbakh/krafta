import Link from "next/link";
import { signInAction } from "@/app/actions/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { BrandWordmark } from "@/components/brand/brand-wordmark";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; message?: string; next?: string }>;
}) {
  const sp = await searchParams;
  const error = sp.error;
  const message = sp.message;
  const next = sp.next ?? "/dashboard";

  return (
    <div className="rounded-xl border bg-background p-6 shadow-sm">
      <div className="flex flex-col items-center text-center">
        <BrandWordmark text="Krafta.Pay" className="text-4xl leading-none" />
        <h1 className="mt-6 text-xl font-semibold">Sign in</h1>
        <p className="mt-2 text-sm text-muted-foreground">Use your Krafta account.</p>
      </div>

      {error ? (
        <div className="mt-4 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm">
          {error}
        </div>
      ) : null}

      {message ? (
        <div className="mt-4 rounded-md border bg-muted px-3 py-2 text-sm">
          {message}
        </div>
      ) : null}

      <form action={signInAction} className="mt-6 space-y-3">
        <input type="hidden" name="next" value={next} />

        <div className="space-y-1">
          <label className="text-sm font-medium" htmlFor="email">
            Email
          </label>
          <Input id="email" name="email" type="email" required placeholder="you@company.com" />
        </div>

        <div className="space-y-1">
          <label className="text-sm font-medium" htmlFor="password">
            Password
          </label>
          <Input id="password" name="password" type="password" required />
        </div>

        <Button className="w-full" type="submit">
          Sign in
        </Button>
      </form>

      <p className="mt-4 text-sm text-muted-foreground">
        No account?{" "}
        <Link className="text-foreground underline" href={`/signup?next=${encodeURIComponent(next)}`}>
          Sign up
        </Link>
      </p>
    </div>
  );
}
