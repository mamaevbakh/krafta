import Link from "next/link";
import { BrandWordmark } from "@/components/brand-wordmark";
import { Button } from "@/components/ui/button";
import Silk from "@/components/Silk";

export default function HomePage() {
  return (
    <main className="bg-zinc-100 dark:bg-zinc-950 relative flex min-h-svh items-center justify-center overflow-hidden px-6 py-16">
      <div className="pointer-events-none absolute inset-0">
        <Silk
          speed={5}
          scale={1}
          color="#292929"
          noiseIntensity={1.5}
          rotation={0}
        />
      </div>

      <div className="relative z-10 w-full max-w-xl rounded-2xl  p-10 text-center ">
        <BrandWordmark className="text-[clamp(3rem,9vw,6rem)] leading-none" />
        <p className="text-muted-foreground mx-auto mt-4 max-w-md text-sm">
          Centralized authentication for Krafta products.
        </p>
        <div className="mt-8">
          <Button asChild>
            <Link href="/login">Continue</Link>
          </Button>
        </div>
      </div>
    </main>
  );
}
