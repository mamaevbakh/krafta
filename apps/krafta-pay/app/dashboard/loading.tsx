import { Skeleton } from "@/components/ui/skeleton";

// `/dashboard` is a resolver, not a page: it looks up which org this user
// belongs to and redirects to /dashboard/org/[orgSlug] (or to /onboarding).
// Every org screen below has its own loading.tsx, so this fallback is only ever
// on screen while that lookup runs — a metrics grid and a table here would be
// pure invention, and would flash a layout the redirect immediately discards.
//
// The dashboard layout supplies the page container, so this starts at content.
export default function DashboardLoading() {
  return (
    <div role="status" aria-label="Loading">
      <div aria-hidden="true" className="space-y-3">
        <Skeleton className="h-7 w-52" />
        <Skeleton className="h-4 w-72" />
      </div>
    </div>
  );
}
