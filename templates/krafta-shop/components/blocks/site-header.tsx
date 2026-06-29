import Link from "next/link";
import { siteConfig } from "@/lib/site.config";

// Pure-presentation block — zero commerce logic. The agent rewrites this freely
// (logo, nav, layout) per the merchant's brief.
export function SiteHeader({ shopName }: { shopName: string }) {
  return (
    <header className="border-b border-border">
      <div className="mx-auto flex h-16 max-w-5xl items-center justify-between px-4">
        <Link href="/" className="text-lg font-semibold tracking-tight">
          {shopName}
        </Link>
        <nav className="flex items-center gap-6 text-sm text-muted-foreground">
          {siteConfig.nav.map((item) => (
            <Link key={item.href} href={item.href} className="hover:text-foreground">
              {item.label}
            </Link>
          ))}
        </nav>
      </div>
    </header>
  );
}
