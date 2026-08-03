import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export default function InvoiceDetailLoading() {
  return (
    <div role="status" aria-label="Loading">
      <div aria-hidden="true" className="space-y-8">
        <div>
          <Skeleton className="h-4 w-28" />

          <header className="mt-3 flex flex-wrap items-start justify-between gap-3">
            <div>
              <Skeleton className="h-7 w-36" />
              <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
                <Skeleton className="h-3 w-56" />
                <Skeleton className="h-4 w-44" />
              </div>
            </div>
            <Skeleton className="h-5 w-16 rounded-full" />
          </header>
        </div>

        <div className="overflow-hidden rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/40 hover:bg-muted/40">
                <TableHead className="px-4">
                  <Skeleton className="h-3 w-24" />
                </TableHead>
                <TableHead>
                  <Skeleton className="ml-auto h-3 w-10" />
                </TableHead>
                <TableHead>
                  <Skeleton className="ml-auto h-3 w-14" />
                </TableHead>
                <TableHead className="px-4">
                  <Skeleton className="ml-auto h-3 w-16" />
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {/* Three rows, not the usual six: an invoice is a plan line plus a
                  usage line, so a taller placeholder would collapse on load. */}
              {Array.from({ length: 3 }).map((_, i) => (
                <TableRow key={i} className="hover:bg-transparent">
                  <TableCell className="px-4">
                    <Skeleton className="h-4 w-48" />
                  </TableCell>
                  <TableCell>
                    <Skeleton className="ml-auto h-4 w-8" />
                  </TableCell>
                  <TableCell>
                    <Skeleton className="ml-auto h-4 w-20" />
                  </TableCell>
                  <TableCell className="px-4">
                    <Skeleton className="ml-auto h-4 w-24" />
                  </TableCell>
                </TableRow>
              ))}
              <TableRow className="bg-muted/40 hover:bg-muted/40">
                <TableCell className="px-4">
                  <Skeleton className="h-4 w-16" />
                </TableCell>
                <TableCell />
                <TableCell />
                <TableCell className="px-4">
                  <Skeleton className="ml-auto h-4 w-24" />
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </div>

        <div className="max-w-2xl space-y-1.5">
          <Skeleton className="h-3 w-full" />
          <Skeleton className="h-3 w-2/3" />
        </div>
      </div>
    </div>
  );
}
