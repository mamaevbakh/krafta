"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

/**
 * Shown when a signed-in user has no organization.
 *
 * Deliberately one field. Everything a billing account genuinely needs later —
 * tax identity, provider credentials, plans — is collected at the point it gets
 * used, not stockpiled at the door. An INN field here would be the single
 * highest-friction question in the whole product and it would buy nothing: the
 * merchant's own acquirer already ran KYB on them, and we never touch the money.
 */
export function CreateAccount() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!name.trim() || pending) return;

    setPending(true);
    setError(null);

    try {
      const response = await fetch("/api/dashboard/account", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: name.trim() }),
      });
      const payload = (await response.json()) as { error?: string };

      if (!response.ok) {
        setError(
          payload.error === "account_already_exists"
            ? "You already have an account. Reload the page."
            : "Could not create the account. Try again.",
        );
        return;
      }

      router.refresh();
    } catch {
      setError("Could not reach the server. Check your connection and try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <Card className="max-w-md">
      <CardHeader>
        <CardTitle>Name your business</CardTitle>
        <CardDescription>
          This is the account your plans, API keys, and subscriptions belong to. You can change the
          name later.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={submit} className="grid gap-4">
          <div className="grid gap-1.5">
            <Label htmlFor="account-name">Business name</Label>
            <Input
              id="account-name"
              name="name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Aladeen Coffee"
              autoComplete="organization"
              maxLength={120}
              required
            />
          </div>

          {error ? (
            <p className="text-sm text-destructive" role="alert">
              {error}
            </p>
          ) : null}

          <Button type="submit" disabled={pending || !name.trim()}>
            {pending ? "Creating…" : "Create account"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
