import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

// Emails are the name column, and they differ in length — a stack of identical
// bars reads as a table that failed rather than one that is still arriving.
const NAME_WIDTHS = ["w-44", "w-56", "w-40", "w-52", "w-36", "w-48"];

export default function CustomersLoading() {
  return (
    <div role="status" aria-label="Loading">
      <div aria-hidden="true" className="space-y-8">
        <header>
          <Skeleton className="h-7 w-36" />
          <Skeleton className="mt-2 h-4 w-64" />
        </header>

        <section className="space-y-3">
          <div className="overflow-hidden rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40 hover:bg-muted/40">
                  <TableHead className="px-4">
                    <Skeleton className="h-3 w-20" />
                  </TableHead>
                  <TableHead>
                    <Skeleton className="h-3 w-24" />
                  </TableHead>
                  <TableHead className="text-right">
                    <Skeleton className="ml-auto h-3 w-14" />
                  </TableHead>
                  <TableHead>
                    <Skeleton className="h-3 w-14" />
                  </TableHead>
                  <TableHead className="w-0 px-4" />
                </TableRow>
              </TableHeader>

              <TableBody>
                {NAME_WIDTHS.map((width, i) => (
                  <TableRow key={i} className="hover:bg-transparent">
                    <TableCell className="px-4">
                      <Skeleton className={`h-4 ${width}`} />
                    </TableCell>
                    <TableCell>
                      <Skeleton className="h-5 w-20 rounded-full" />
                    </TableCell>
                    <TableCell className="text-right">
                      <Skeleton className="ml-auto h-4 w-24" />
                    </TableCell>
                    <TableCell>
                      <Skeleton className="h-4 w-24" />
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
