import { Skeleton } from "@/components/ui/skeleton";

// /login renders no form of its own — it normalizes the `next` target and
// redirects to SSO (or to Krafta's login). So this is a placeholder for the few
// frames that resolution takes, not a preview of a sign-in card: drawing email
// and password fields here would promise a screen that never arrives.
// The auth layout already centres this inside a max-w-md column.
export default function LoginLoading() {
  return (
    <div role="status" aria-label="Loading">
      <div aria-hidden="true" className="space-y-3">
        <Skeleton className="h-6 w-40" />
        <Skeleton className="h-4 w-56" />
      </div>
    </div>
  );
}
