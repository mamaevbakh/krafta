/**
 * landing-footer.tsx — brand, tagline, link columns, and a footer-level
 * language switcher. Internal routes only (no fabricated external links).
 */

import Link from "next/link";

import { BrandWordmark } from "@/components/brand/brand-wordmark";
import { LangSwitcher } from "./lang-switcher";
import {
  DASHBOARD_HREF,
  DEMO_HREF,
  ONBOARDING_HREF,
  SIGN_IN_HREF,
} from "./landing-actions";
import type { LandingContent, LandingLocale } from "./content";

export function LandingFooter({
  authed,
  content,
  activeLocale,
}: {
  authed: boolean;
  content: LandingContent;
  activeLocale: LandingLocale;
}) {
  const year = 2026;
  const productLinks = [
    { href: "#features", label: content.nav.features },
    { href: "#pricing", label: content.nav.pricing },
    { href: DEMO_HREF, label: content.actions.viewDemo },
  ];
  const accountLinks = authed
    ? [{ href: DASHBOARD_HREF, label: content.actions.dashboard }]
    : [
        { href: ONBOARDING_HREF, label: content.actions.createShop },
        { href: SIGN_IN_HREF, label: content.actions.signIn },
      ];

  return (
    <footer className="border-t border-border bg-secondary-background">
      <div className="mx-auto max-w-[1248px] px-6 py-14">
        <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-4">
          <div className="lg:col-span-2">
            <BrandWordmark className="text-2xl" />
            <p className="mt-3 max-w-xs text-sm leading-relaxed text-muted-foreground">
              {content.footer.tagline}
            </p>
          </div>

          <FooterColumn heading={content.footer.productHeading} links={productLinks} />
          <FooterColumn heading={content.footer.accountHeading} links={accountLinks} />
        </div>

        <div className="mt-12 flex flex-col-reverse items-start justify-between gap-4 border-t border-border pt-6 sm:flex-row sm:items-center">
          <p className="text-xs text-muted-foreground">
            © {year} Krafta. {content.footer.rights}
          </p>
          <LangSwitcher activeLocale={activeLocale} />
        </div>
      </div>
    </footer>
  );
}

function FooterColumn({
  heading,
  links,
}: {
  heading: string;
  links: { href: React.ComponentProps<typeof Link>["href"]; label: string }[];
}) {
  return (
    <div>
      <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {heading}
      </h3>
      <ul className="mt-4 space-y-3">
        {links.map((link) => (
          <li key={link.label}>
            <Link
              href={link.href}
              className="text-sm text-foreground transition-colors hover:text-muted-foreground"
            >
              {link.label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
