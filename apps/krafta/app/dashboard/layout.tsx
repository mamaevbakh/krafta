import { Suspense } from "react";
import type { ReactNode } from "react";
import type { Metadata } from "next";

import { DashboardLocaleProvider } from "@/lib/locales/dashboard/context";
import { getDashboardLocale } from "@/lib/locales/dashboard/server";

/**
 * Dashboard layout.
 * Auth protection is handled by the proxy (proxy.ts),
 * which redirects unauthenticated users before this layout renders.
 *
 * Resolves the merchant's UI locale (cookie → Accept-Language → ru) once here
 * and provides it to the whole dashboard tree. Client components read it via
 * useT(); server components call getDashboardT() directly.
 *
 * The cookie/header read is isolated in a Suspense-wrapped async child so
 * accessing runtime data doesn't block the whole route from streaming (Cache
 * Components). Mirrors the catalog layout's cookie-inside-Suspense pattern.
 */

// Belt-and-suspenders: the whole merchant admin is auth-walled and disallowed
// in robots.txt, but declare noindex too so a stray inbound link to any
// dashboard URL can never surface in search results.
export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default function DashboardLayout({ children }: { children: ReactNode }) {
  return (
    <Suspense fallback={children}>
      <LocalizedDashboard>{children}</LocalizedDashboard>
    </Suspense>
  );
}

async function LocalizedDashboard({ children }: { children: ReactNode }) {
  const locale = await getDashboardLocale();
  return (
    <DashboardLocaleProvider locale={locale}>
      {children}
    </DashboardLocaleProvider>
  );
}
