import {
  DashboardHeaderSkeleton,
  DataTableSkeleton,
} from "@/components/dashboard/skeletons";

export default function ModifiersLoading() {
  return (
    <main className="w-full">
      <DashboardHeaderSkeleton subtitle={false} action />
      <div className="mx-auto max-w-[1248px] px-6 py-8">
        <DataTableSkeleton columns={["flex-1", "w-24", "w-20", "w-10"]} rows={5} />
      </div>
    </main>
  );
}
