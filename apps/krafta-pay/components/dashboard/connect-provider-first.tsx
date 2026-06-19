import Link from "next/link";
import { CreditCard } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

// Guided empty state shown wherever a merchant tries to create a payment link or
// subscription before connecting a provider — so they never hit a dead-end
// "no payment methods" checkout.
export function ConnectProviderFirst({
  orgId,
  environment,
  what = "create subscriptions or payment links",
}: {
  orgId: string;
  environment: string;
  what?: string;
}) {
  return (
    <Card size="sm" className="mt-4 max-w-md">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-sm">
          <CreditCard className="size-4 text-muted-foreground" aria-hidden />
          Connect a provider first
        </CardTitle>
        <CardDescription>
          You need an active payment provider in{" "}
          <span className="font-medium">{environment}</span> before you can {what}.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Link
          href={`/dashboard/providers${orgId ? `?orgId=${orgId}` : ""}`}
          className={buttonVariants({ size: "sm" })}
        >
          Connect a provider
        </Link>
      </CardContent>
    </Card>
  );
}
