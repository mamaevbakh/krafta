import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export default function BillingLoading() {
  return (
    <div role="status" aria-label="Loading">
      <div aria-hidden="true" className="space-y-8">
        <header>
          <Skeleton className="h-7 w-40" />
          <Skeleton className="mt-2 h-4 w-full max-w-md" />
        </header>

        {/* Plan + next invoice */}
        <dl className="grid gap-px overflow-hidden rounded-lg border bg-border sm:grid-cols-2">
          <div className="bg-background p-4">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="mt-2 h-6 w-40" />
            <Skeleton className="mt-2 h-3 w-48" />
          </div>
          <div className="bg-background p-4">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="mt-2 h-6 w-32" />
            <Skeleton className="mt-2 h-3 w-44" />
          </div>
        </dl>

        {/* Usage this period */}
        <section className="space-y-3">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <Skeleton className="h-4 w-28" />
            <Skeleton className="h-3 w-44" />
          </div>

          <div className="rounded-lg border">
            <dl className="grid gap-px bg-border sm:grid-cols-2">
              <div className="bg-background p-4">
                <Skeleton className="h-3 w-28" />
                <Skeleton className="mt-2 h-6 w-36" />
                <Skeleton className="mt-2 h-3 w-24" />
              </div>
              <div className="bg-background p-4">
                <Skeleton className="h-3 w-24" />
                <Skeleton className="mt-2 h-6 w-28" />
                <Skeleton className="mt-2 h-3 w-40" />
              </div>
            </dl>
          </div>

          <Skeleton className="h-3 w-64" />
        </section>

        {/* Payment method */}
        <section className="space-y-3">
          <Skeleton className="h-4 w-32" />
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-4">
            <div className="min-w-0">
              <Skeleton className="h-4 w-40" />
              <Skeleton className="mt-2 h-3 w-28" />
            </div>
            <Skeleton className="h-8 w-28" />
          </div>
        </section>

        {/* Invoice history */}
        <section className="space-y-3">
          <Skeleton className="h-4 w-24" />
          <div className="overflow-hidden rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40 hover:bg-muted/40">
                  <TableHead className="px-4">
                    <Skeleton className="h-3 w-14" />
                  </TableHead>
                  <TableHead>
                    <Skeleton className="h-3 w-16" />
                  </TableHead>
                  <TableHead>
                    <Skeleton className="h-3 w-14" />
                  </TableHead>
                  <TableHead>
                    <Skeleton className="ml-auto h-3 w-14" />
                  </TableHead>
                  <TableHead className="w-0 px-4" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {Array.from({ length: 6 }).map((_, i) => (
                  <TableRow key={i} className="hover:bg-transparent">
                    <TableCell className="px-4">
                      <Skeleton className="h-4 w-24" />
                    </TableCell>
                    <TableCell>
                      <Skeleton className="h-3 w-44" />
                    </TableCell>
                    <TableCell>
                      <Skeleton className="h-5 w-16 rounded-full" />
                    </TableCell>
                    <TableCell>
                      <Skeleton className="ml-auto h-4 w-20" />
                    </TableCell>
                    <TableCell className="px-4">
                      <Skeleton className="size-4" />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </section>
      </div>
    </div>
  );
}
