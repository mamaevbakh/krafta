import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

// Row counts are per section rather than uniform: one person usually has a
// couple of subscriptions and a single saved card, so padding those out to
// list length would make the page collapse upward when the data lands.
const SUB_ROWS = 3;
const INVOICE_ROWS = 6;
const METHOD_ROWS = 2;

const SUMMARY_TILES = [
  { label: "w-16", value: "w-28" },
  { label: "w-28", value: "w-8" },
  { label: "w-20", value: "w-24" },
];

export default function CustomerDetailLoading() {
  return (
    <div role="status" aria-label="Loading">
      <div aria-hidden="true" className="space-y-8">
        <div>
          <Skeleton className="h-4 w-28" />

          <header className="mt-3 flex flex-wrap items-start justify-between gap-3">
            <div>
              <Skeleton className="h-7 w-56" />
              <Skeleton className="mt-2 h-4 w-72" />
            </div>
          </header>
        </div>

        <dl className="grid gap-px overflow-hidden rounded-lg border bg-border sm:grid-cols-3">
          {SUMMARY_TILES.map((tile, i) => (
            <div key={i} className="bg-background p-4">
              <Skeleton className={`h-3 ${tile.label}`} />
              <Skeleton className={`mt-2 h-6 ${tile.value}`} />
            </div>
          ))}
        </dl>

        <section className="space-y-3">
          <Skeleton className="h-4 w-28" />
          <div className="overflow-hidden rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40 hover:bg-muted/40">
                  <TableHead className="px-4">
                    <Skeleton className="h-3 w-10" />
                  </TableHead>
                  <TableHead>
                    <Skeleton className="h-3 w-12" />
                  </TableHead>
                  <TableHead className="text-right">
                    <Skeleton className="ml-auto h-3 w-14" />
                  </TableHead>
                  <TableHead>
                    <Skeleton className="h-3 w-14" />
                  </TableHead>
                  <TableHead className="px-4">
                    <Skeleton className="h-3 w-20" />
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {Array.from({ length: SUB_ROWS }).map((_, i) => (
                  <TableRow key={i} className="hover:bg-transparent">
                    <TableCell className="px-4">
                      <Skeleton className="h-4 w-36" />
                    </TableCell>
                    <TableCell>
                      <Skeleton className="h-5 w-16 rounded-full" />
                    </TableCell>
                    <TableCell className="text-right">
                      <Skeleton className="ml-auto h-4 w-28" />
                    </TableCell>
                    <TableCell>
                      <Skeleton className="h-4 w-24" />
                    </TableCell>
                    <TableCell className="px-4">
                      <Skeleton className="h-4 w-24" />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </section>

        <section className="space-y-3">
          <Skeleton className="h-4 w-20" />
          <div className="overflow-hidden rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40 hover:bg-muted/40">
                  <TableHead className="px-4">
                    <Skeleton className="h-3 w-12" />
                  </TableHead>
                  <TableHead className="text-right">
                    <Skeleton className="ml-auto h-3 w-14" />
                  </TableHead>
                  <TableHead>
                    <Skeleton className="h-3 w-14" />
                  </TableHead>
                  <TableHead>
                    <Skeleton className="h-3 w-8" />
                  </TableHead>
                  <TableHead>
                    <Skeleton className="h-3 w-8" />
                  </TableHead>
                  <TableHead className="px-4">
                    <Skeleton className="h-3 w-16" />
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {Array.from({ length: INVOICE_ROWS }).map((_, i) => (
                  <TableRow key={i} className="hover:bg-transparent">
                    <TableCell className="px-4">
                      <Skeleton className="h-5 w-16 rounded-full" />
                    </TableCell>
                    <TableCell className="text-right">
                      <Skeleton className="ml-auto h-4 w-24" />
                    </TableCell>
                    <TableCell>
                      <Skeleton className="h-4 w-24" />
                    </TableCell>
                    <TableCell>
                      <Skeleton className="h-4 w-24" />
                    </TableCell>
                    <TableCell>
                      <Skeleton className="h-4 w-24" />
                    </TableCell>
                    <TableCell className="px-4">
                      <Skeleton className="h-7 w-72" />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </section>

        <section className="space-y-3">
          <Skeleton className="h-4 w-32" />
          <ul className="divide-y overflow-hidden rounded-lg border">
            {Array.from({ length: METHOD_ROWS }).map((_, i) => (
              <li key={i} className="flex flex-wrap items-center gap-x-3 gap-y-1 p-4">
                <Skeleton className="h-4 w-16" />
                <Skeleton className="h-4 w-20" />
                <Skeleton className="h-4 w-12" />
                <Skeleton className="h-5 w-16 rounded-full" />
                <Skeleton className="ml-auto h-3 w-28" />
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}
