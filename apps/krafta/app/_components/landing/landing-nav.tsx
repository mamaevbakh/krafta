"use client";

/**
 * landing-nav.tsx — sticky marketing top bar.
 *
 * Desktop: brand wordmark · anchor links · language + theme icon cluster ·
 * Sign in + primary CTA. Mobile: brand · icon cluster · hamburger that opens a
 * Sheet with the same links and actions.
 *
 * `authed` is resolved once on the server (page root) and threaded down so the
 * primary CTA reads "Open dashboard" for returning visitors and "Create your
 * shop" for everyone else — no client-side auth round-trip.
 */

import * as React from "react";
import Link from "next/link";
import { Menu } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { BrandWordmark } from "@/components/brand/brand-wordmark";
import { ModeToggle } from "@/components/catalogs/headers/mode-toggle";
import { cn } from "@/lib/utils";
import { LangSwitcher } from "./lang-switcher";
import {
  DASHBOARD_HREF,
  ONBOARDING_HREF,
  SIGN_IN_HREF,
} from "./landing-actions";
import type { LandingContent, LandingLocale } from "./content";

type LandingNavProps = {
  authed: boolean;
  content: LandingContent;
  activeLocale: LandingLocale;
};

export function LandingNav({ authed, content, activeLocale }: LandingNavProps) {
  const links = [
    { href: "#features", label: content.nav.features },
    { href: "#how", label: content.nav.how },
    { href: "#channels", label: content.nav.channels },
    { href: "#pricing", label: content.nav.pricing },
    { href: "#faq", label: content.nav.faq },
  ];

  const primaryLabel = authed
    ? content.actions.dashboard
    : content.actions.createShop;
  const primaryHref = authed ? DASHBOARD_HREF : ONBOARDING_HREF;

  return (
    <header className="sticky top-0 z-50 border-b border-border bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="mx-auto flex h-16 max-w-[1248px] items-center justify-between gap-4 px-6">
        <div className="flex shrink-0 items-center gap-3">
          <Link
            href="/"
            aria-label="Krafta"
            className="rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <BrandWordmark className="text-2xl" />
          </Link>
        </div>

        <nav className="hidden items-center gap-1 md:flex">
          {links.map((link) => (
            <Button
              key={link.href}
              asChild
              variant="ghost"
              size="sm"
              className="text-muted-foreground hover:text-foreground"
            >
              <Link href={link.href}>{link.label}</Link>
            </Button>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          <LangSwitcher activeLocale={activeLocale} />
          <ModeToggle />

          <div className="hidden items-center gap-2 md:flex">
            {!authed && (
              <Button asChild variant="ghost" size="sm">
                <Link href={SIGN_IN_HREF} prefetch={false}>{content.actions.signIn}</Link>
              </Button>
            )}
            <Button asChild size="sm">
              <Link href={primaryHref}>{primaryLabel}</Link>
            </Button>
          </div>

          <MobileMenu
            links={links}
            authed={authed}
            content={content}
            primaryHref={primaryHref}
            primaryLabel={primaryLabel}
          />
        </div>
      </div>
    </header>
  );
}

function MobileMenu({
  links,
  authed,
  content,
  primaryHref,
  primaryLabel,
}: {
  links: { href: string; label: string }[];
  authed: boolean;
  content: LandingContent;
  primaryHref: React.ComponentProps<typeof Link>["href"];
  primaryLabel: string;
}) {
  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button
          variant="outline"
          size="icon"
          className="rounded-full bg-muted text-foreground hover:bg-muted/80 md:hidden"
          aria-label="Menu"
        >
          <Menu className="size-4" />
        </Button>
      </SheetTrigger>
      <SheetContent side="right" className="w-[min(20rem,85vw)]">
        <SheetHeader>
          <SheetTitle className="text-left">
            <BrandWordmark className="text-2xl" />
          </SheetTitle>
        </SheetHeader>

        <nav className="flex flex-col gap-1 px-2">
          {links.map((link) => (
            <SheetClose asChild key={link.href}>
              <Link
                href={link.href}
                className={cn(
                  "rounded-md px-3 py-2.5 text-base font-medium text-foreground",
                  "transition-colors hover:bg-accent hover:text-accent-foreground",
                )}
              >
                {link.label}
              </Link>
            </SheetClose>
          ))}
        </nav>

        <div className="mt-auto flex flex-col gap-2 border-t border-border p-4">
          {!authed && (
            <SheetClose asChild>
              <Button asChild variant="outline" className="w-full">
                <Link href={SIGN_IN_HREF} prefetch={false}>{content.actions.signIn}</Link>
              </Button>
            </SheetClose>
          )}
          <SheetClose asChild>
            <Button asChild className="w-full">
              <Link href={primaryHref}>{primaryLabel}</Link>
            </Button>
          </SheetClose>
        </div>
      </SheetContent>
    </Sheet>
  );
}
