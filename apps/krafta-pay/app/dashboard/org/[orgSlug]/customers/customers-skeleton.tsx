import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

// Names differ in length — a stack of identical bars reads as a table that
// failed rather than one that is still arriving.
const NAME_WIDTHS = ["w-44", "w-56", "w-40", "w-52", "w-36", "w-48"];

/**
 * The customers table, mid-arrival.
 *
 * Shared by the route's `loading.tsx` and by the list component's own fetch,
 * because this page loads in TWO stages: Next streams the route skeleton, then
 * the client asks the API for the rows. When those two states looked different
 * — a six-row table, then a one-line "Loading customers…" box — the page drew a
 * table, collapsed to a strip, and expanded into a table again. Two shifts to
 * show one list.
 *
 * One shape for both stages means the page settles once, when the data lands.
 */
export function CustomersTableSkeleton() {
  return (
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
  );
}
