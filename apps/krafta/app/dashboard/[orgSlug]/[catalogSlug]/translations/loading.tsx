import {
  DashboardHeaderSkeleton,
  DataTableSkeleton,
} from "@/components/dashboard/skeletons";
import { Skeleton } from "@/components/ui/skeleton";

export default function TranslationsLoading() {
  return (
    <div className="flex h-full min-h-screen flex-col">
      <DashboardHeaderSkeleton subtitle={false} />

      {/* Pill tab strip (Overview / Items / Categories / …) */}
      <div className="border-b px-2 py-2">
        <div className="inline-flex gap-1 rounded-md border border-border p-1">
          {Array.from({ length: 7 }).map((_, i) => (
            <Skeleton key={i} className="h-8 w-20 rounded-sm" />
          ))}
        </div>
      </div>

      <div className="mx-auto w-full max-w-[1248px] px-6 py-6">
        <DataTableSkeleton columns={["flex-1", "flex-1", "w-24", "w-16"]} />
      </div>
    </div>
  );
}
