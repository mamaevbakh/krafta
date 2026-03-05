import Link from "next/link";
import { Suspense } from "react";
import { BrandWordmark } from "@/components/brand-wordmark";
import Silk from "@/components/Silk";
import { createClient } from "@/lib/supabase/server";
import { getUserSafely } from "@krafta/supabase/auth";
import { ArrowUpRight } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

function resolveBaseUrl(
  primary: string | undefined,
  secondary: string | undefined,
  fallback: string,
) {
  const candidate = primary?.trim() || secondary?.trim() || fallback;
  try {
    return new URL(candidate).origin;
  } catch {
    return fallback;
  }
}

function destination(baseUrl: string, isAuthed: boolean) {
  return new URL(isAuthed ? "/dashboard" : "/", baseUrl).toString();
}

function LauncherCardsSkeleton() {
  return (
    <div className="mt-8 grid gap-3 sm:grid-cols-2">
      <div className="rounded-xl border border-white/10 bg-white/5 p-4">
        <div className="flex items-center justify-between">
          <Skeleton className="h-8 w-28 bg-white/15" />
          <Skeleton className="size-5 rounded-full bg-white/15" />
        </div>
        <Skeleton className="mt-3 h-3 w-24 bg-white/10" />
      </div>
      <div className="rounded-xl border border-white/10 bg-white/5 p-4">
        <div className="flex items-center justify-between">
          <Skeleton className="h-8 w-36 bg-white/15" />
          <Skeleton className="size-5 rounded-full bg-white/15" />
        </div>
        <Skeleton className="mt-3 h-3 w-24 bg-white/10" />
      </div>
    </div>
  );
}

async function ProductLauncherCards({
  kraftaBaseUrl,
  payBaseUrl,
}: {
  kraftaBaseUrl: string;
  payBaseUrl: string;
}) {
  const supabase = await createClient();
  const { user } = await getUserSafely(supabase);
  const isAuthed = Boolean(user);
  return (
    <div className="mt-8 grid gap-3 sm:grid-cols-2">
      <Link
        href={destination(kraftaBaseUrl, isAuthed)}
        className="group rounded-xl border border-white/15 bg-white/5 p-4 transition-colors hover:bg-white/10"
      >
        <div className="flex items-center justify-between gap-3">
          <BrandWordmark className="text-3xl" />
          <ArrowUpRight className="size-5 text-white/80 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
        </div>
        <p className="mt-2 text-xs text-white/60">
          {isAuthed ? "Open dashboard" : "Open website"}
        </p>
      </Link>

      <Link
        href={destination(payBaseUrl, isAuthed)}
        className="group rounded-xl border border-white/15 bg-white/5 p-4 transition-colors hover:bg-white/10"
      >
        <div className="flex items-center justify-between gap-3">
          <BrandWordmark text="Krafta Pay" className="text-3xl" />
          <ArrowUpRight className="size-5 text-white/80 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
        </div>
        <p className="mt-2 text-xs text-white/60">
          {isAuthed ? "Open dashboard" : "Open website"}
        </p>
      </Link>
    </div>
  );
}

export default function HomePage() {
  const kraftaBaseUrl = resolveBaseUrl(
    process.env.KRAFTA_APP_URL,
    process.env.NEXT_PUBLIC_KRAFTA_APP_URL,
    "https://krafta.org",
  );
  const payBaseUrl = resolveBaseUrl(
    process.env.KRAFTA_PAY_URL,
    process.env.NEXT_PUBLIC_KRAFTA_PAY_URL,
    "https://pay.krafta.org",
  );

  return (
    <main className="dark bg-zinc-950 relative flex min-h-svh items-center justify-center overflow-hidden px-6 py-16">
      <div className="pointer-events-none absolute inset-0">
        <Silk
          speed={5}
          scale={1}
          color="#292929"
          noiseIntensity={1.5}
          rotation={0}
        />
      </div>

      <div className="relative z-10 w-full max-w-2xl rounded-2xl border border-white/15 bg-black/55 p-8 shadow-2xl backdrop-blur-md">
        <div className="text-center">
          <BrandWordmark className="text-[clamp(3rem,9vw,6rem)] leading-none" />
        </div>
        <p className="text-muted-foreground mx-auto mt-4 max-w-md text-center text-sm">
          Centralized authentication for Krafta products.
        </p>
        <Suspense fallback={<LauncherCardsSkeleton />}>
          <ProductLauncherCards
            kraftaBaseUrl={kraftaBaseUrl}
            payBaseUrl={payBaseUrl}
          />
        </Suspense>
      </div>
    </main>
  );
}
