import { Button } from "@/components/ui/button";
import { Suspense } from "react";
import Link from "next/link";
import { BrandWordmark } from "@/components/brand/brand-wordmark";
import { HomeAuthCta, HomeAuthCtaFallback } from "./_components/home-auth-cta";

export default async function Home() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-50 dark:bg-black px-6 py-16 font-sans">
      <div className="relative z-10 flex h-full w-full items-center justify-center px-6">
        <div className="flex flex-col items-center text-center">
          <p className="text-sm font-medium text-foreground">Available Soon</p>

          <h1 className="mt-4">
            <BrandWordmark className="leading-none text-[clamp(6rem,10vw,12rem)]" />
          </h1>

          <div className="mt-8 flex flex-col gap-4 text-base font-medium sm:flex-row">
            <Button asChild variant="default">
              <Link href="/vintage-shop">View Demo</Link>
            </Button>

            <Suspense fallback={<HomeAuthCtaFallback />}>
              <HomeAuthCta />
            </Suspense>
          </div>
        </div>
      </div>
    </div>
  );
}
