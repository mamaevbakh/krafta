import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

const ROWS = [0, 1, 2, 3, 4, 5];

export default function SubscriptionsLoading() {
  return (
    <div role="status" aria-label="Loading">
      <div aria-hidden="true" className="space-y-8">
        <header>
          <Skeleton className="h-7 w-44" />
          <Skeleton className="mt-2 h-4 w-80" />
        </header>

        <section>
          <div className="rounded-lg border p-3">
            <div className="flex flex-wrap items-end gap-3">
              <div className="grid min-w-56 flex-1 gap-1.5">
                <Skeleton className="h-3 w-28" />
                <Skeleton className="h-9 w-full" />
              </div>
              <div className="grid min-w-56 flex-1 gap-1.5">
                <Skeleton className="h-3 w-10" />
                <Skeleton className="h-9 w-full" />
              </div>
              <Skeleton className="h-9 w-40" />
            </div>
            <Skeleton className="mt-2.5 h-3 w-96 max-w-full" />
          </div>
        </section>

        <section className="space-y-3">
          <div className="overflow-hidden rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40 hover:bg-muted/40">
                  <TableHead className="px-4">
                    <Skeleton className="h-3 w-16" />
                  </TableHead>
                  <TableHead>
                    <Skeleton className="h-3 w-12" />
                  </TableHead>
                  <TableHead>
                    <Skeleton className="h-3 w-10" />
                  </TableHead>
                  <TableHead>
                    <Skeleton className="ml-auto h-3 w-14" />
                  </TableHead>
                  <TableHead>
                    <Skeleton className="h-3 w-20" />
                  </TableHead>
                  <TableHead>
                    <Skeleton className="h-3 w-16" />
                  </TableHead>
                  <TableHead className="w-0 px-4" />
                </TableRow>
              </TableHeader>

              <TableBody>
                {ROWS.map((row) => (
                  <TableRow key={row}>
                    <TableCell className="px-4">
                      <Skeleton className="h-4 w-44" />
                    </TableCell>
                    <TableCell>
                      <Skeleton className="h-5 w-16 rounded-4xl" />
                    </TableCell>
                    <TableCell>
                      <Skeleton className="h-4 w-32" />
                    </TableCell>
                    <TableCell>
                      <Skeleton className="ml-auto h-4 w-24" />
                    </TableCell>
                    <TableCell>
                      <Skeleton className="h-4 w-24" />
                    </TableCell>
                    {/* Matches the PayLink copy field, which is fixed at w-64 —
                        a narrower bar would let the table jump on swap. */}
                    <TableCell>
                      <Skeleton className="h-8 w-64" />
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
