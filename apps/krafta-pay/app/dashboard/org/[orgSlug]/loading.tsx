import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export default function OrgOverviewLoading() {
  return (
    <div role="status" aria-label="Loading">
      <div aria-hidden="true" className="space-y-10">
        <header>
          <Skeleton className="h-7 w-40" />
          <Skeleton className="mt-2 h-4 w-64" />
        </header>

        <section className="space-y-3">
          <div className="flex items-baseline justify-between gap-3">
            <Skeleton className="h-4 w-36" />
            <Skeleton className="h-3 w-28" />
          </div>

          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <Skeleton className="size-4" />
                <Skeleton className="h-4 w-40" />
              </div>
              <Skeleton className="h-4 w-72 max-w-full" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-8 w-44" />
              <Skeleton className="mt-1.5 h-4 w-56" />
            </CardContent>
          </Card>

          <div className="grid gap-3 sm:grid-cols-3">
            {["mrr", "subscribers", "churn"].map((metric) => (
              <Card key={metric} size="sm">
                <CardContent className="pt-5">
                  <Skeleton className="h-3 w-24" />
                  <Skeleton className="mt-1.5 h-5 w-28" />
                  <Skeleton className="mt-1 h-3 w-32" />
                </CardContent>
              </Card>
            ))}
          </div>
        </section>

        <section className="grid gap-3 sm:grid-cols-3">
          {["provider", "plan", "keys"].map((step) => (
            <Card key={step} size="sm" className="h-full">
              <CardHeader>
                <div className="flex items-center gap-2">
                  <Skeleton className="size-4" />
                  <Skeleton className="h-4 w-28" />
                </div>
                <Skeleton className="h-4 w-36" />
              </CardHeader>
            </Card>
          ))}
        </section>

        <section>
          <Skeleton className="h-4 w-32" />
          <Skeleton className="mt-1.5 h-4 w-72 max-w-full" />

          {/* Mirrors the payment-link form, not the connect-a-provider prompt: a
              merchant who has already connected one is the case worth optimizing. */}
          <Card size="sm" className="mt-4 max-w-md">
            <CardContent>
              <div className="grid gap-4">
                <div className="grid gap-1.5">
                  <Skeleton className="h-4 w-16" />
                  <Skeleton className="h-9 w-full" />
                </div>
                <div className="grid gap-1.5">
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="h-9 w-full" />
                </div>
                <Skeleton className="h-9 w-36 justify-self-start" />
              </div>
            </CardContent>
          </Card>
        </section>
      </div>
    </div>
  );
}
