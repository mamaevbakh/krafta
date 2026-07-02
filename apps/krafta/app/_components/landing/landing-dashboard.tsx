/**
 * landing-dashboard.tsx — the merchant-side beat. The rest of the page shows the
 * customer's view; this shows YOURS: real screenshots of the live orders queue and
 * the menu editor, framed as browser windows. Completes the loop — "guest orders
 * in the storefront → it lands with you." Real product screenshots (from the
 * actual dashboard), not mockups.
 */

import Image from "next/image";

import { SectionEyebrow } from "./section-heading";
import type { LandingContent } from "./content";

function BrowserFrame({
  src,
  url,
  alt,
  priority,
}: {
  src: string;
  url: string;
  alt: string;
  priority?: boolean;
}) {
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card shadow-[0_24px_60px_-28px_rgba(0,0,0,0.30)]">
      <div className="flex items-center gap-1.5 border-b border-border bg-secondary-background px-3 py-2.5">
        <span className="size-2.5 rounded-full bg-muted-foreground/25" />
        <span className="size-2.5 rounded-full bg-muted-foreground/25" />
        <span className="size-2.5 rounded-full bg-muted-foreground/25" />
        <span className="ml-2 truncate rounded-md bg-background px-2 py-0.5 font-mono text-[10px] text-muted-foreground">
          {url}
        </span>
      </div>
      <Image
        src={src}
        alt={alt}
        width={1440}
        height={900}
        className="w-full"
        priority={priority}
        sizes="(max-width: 768px) 100vw, 900px"
      />
    </div>
  );
}

export function LandingDashboard({ content }: { content: LandingContent }) {
  const { dashboard } = content;
  return (
    <section className="border-t border-border">
      <div className="mx-auto max-w-[1248px] px-6 pb-32 pt-20">
        <div className="max-w-2xl">
          <SectionEyebrow text={dashboard.eyebrow} />
          <h2 className="mt-3 text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
            {dashboard.heading}
          </h2>
          <p className="mt-3 text-base leading-relaxed text-muted-foreground sm:text-lg">
            {dashboard.subheading}
          </p>
        </div>

        <div className="relative mx-auto mt-14 max-w-4xl">
          <BrowserFrame
            src="/landing/dashboard-orders.png"
            url={dashboard.ordersUrl}
            alt={dashboard.ordersAlt}
            priority
          />
          <div className="absolute -bottom-12 right-0 hidden w-[44%] md:block lg:-right-10">
            <BrowserFrame
              src="/landing/dashboard-library.png"
              url={dashboard.libraryUrl}
              alt={dashboard.libraryAlt}
            />
          </div>
        </div>

        <div className="mx-auto mt-6 max-w-4xl md:hidden">
          <BrowserFrame
            src="/landing/dashboard-library.png"
            url={dashboard.libraryUrl}
            alt={dashboard.libraryAlt}
          />
        </div>
      </div>
    </section>
  );
}
