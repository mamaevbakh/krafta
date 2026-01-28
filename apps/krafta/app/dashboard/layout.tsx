import type { ReactNode } from "react";

/**
 * Dashboard layout.
 * Auth protection is handled by the proxy (proxy.ts),
 * which redirects unauthenticated users before this layout renders.
 */
export default function DashboardLayout({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
