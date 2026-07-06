import type { ReactNode } from "react";
import type { Metadata } from "next";

/**
 * Dashboard layout.
 * Auth protection is handled by the proxy (proxy.ts),
 * which redirects unauthenticated users before this layout renders.
 */

// Belt-and-suspenders: the whole merchant admin is auth-walled and disallowed
// in robots.txt, but declare noindex too so a stray inbound link to any
// dashboard URL can never surface in search results.
export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default function DashboardLayout({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
