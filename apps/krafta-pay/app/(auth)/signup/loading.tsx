import { Skeleton } from "@/components/ui/skeleton";

// Same shape as /login, and for the same reason: this route only normalizes
// `next` and redirects, so there is no sign-up form to foreshadow.
// The auth layout already centres this inside a max-w-md column.
export default function SignupLoading() {
  return (
    <div role="status" aria-label="Loading">
      <div aria-hidden="true" className="space-y-3">
        <Skeleton className="h-6 w-48" />
        <Skeleton className="h-4 w-64" />
      </div>
    </div>
  );
}
