import Link from "next/link";
import { siteConfig } from "@/lib/site.config";

export function Hero({
  shopName,
  description,
}: {
  shopName: string;
  description: string | null;
}) {
  return (
    <section className="mx-auto max-w-5xl px-4 py-20 text-center">
      <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">
        {shopName}
      </h1>
      <p className="mx-auto mt-4 max-w-xl text-lg text-muted-foreground">
        {description || siteConfig.tagline}
      </p>
      <div className="mt-8">
        <Link
          href="/menu"
          className="inline-flex h-12 items-center rounded-md bg-primary px-6 text-base font-medium text-primary-foreground transition-opacity hover:opacity-90"
        >
          {siteConfig.heroCta}
        </Link>
      </div>
    </section>
  );
}
