"use client";

import { usePathname } from "next/navigation";

import { Separator } from "@/components/ui/separator";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { useT } from "@/lib/locales/context";
import type { PayMessageKey } from "@/lib/locales/messages";

/**
 * The block's SiteHeader, with the title derived from the route.
 *
 * The title lives here rather than as an <h1> on each page: the block puts it
 * in the header bar, and a page that also prints its own heading ends up
 * saying the same word twice, one under the other.
 */
const TITLES: Array<{ segment: string; key: PayMessageKey }> = [
  { segment: "payments", key: "nav.payments" },
  { segment: "providers", key: "nav.providers" },
  { segment: "plans", key: "nav.plans" },
  { segment: "subscriptions", key: "nav.subscriptions" },
  { segment: "customers", key: "nav.customers" },
  { segment: "tax-codes", key: "nav.taxCodes" },
  { segment: "api-keys", key: "nav.apiKeys" },
  { segment: "webhooks", key: "nav.webhooks" },
  { segment: "logs", key: "nav.logs" },
  { segment: "docs", key: "nav.docs" },
  { segment: "billing", key: "nav.billing" },
];

export function SiteHeader() {
  const t = useT();
  const pathname = usePathname();
  // Last match wins so /customers/<id> still reads "Customers" rather than
  // falling back to the overview.
  const match = TITLES.find((x) => pathname.includes(`/${x.segment}`));

  return (
    <header className="flex h-(--header-height) shrink-0 items-center gap-2 border-b transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar-wrapper:h-(--header-height)">
      <div className="flex w-full items-center gap-1 px-4 lg:gap-2 lg:px-6">
        <SidebarTrigger className="-ml-1" />
        <Separator
          orientation="vertical"
          className="mx-2 h-4 data-vertical:self-auto"
        />
        <h1 className="text-base font-medium">
          {t(match?.key ?? "nav.overview")}
        </h1>
      </div>
    </header>
  );
}
