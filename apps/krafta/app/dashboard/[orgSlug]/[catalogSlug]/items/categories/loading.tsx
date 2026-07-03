import {
  DashboardHeaderSkeleton,
  DataTableSkeleton,
} from "@/components/dashboard/skeletons";

export default function CategoriesLoading() {
  return (
    <main className="w-full">
      <DashboardHeaderSkeleton subtitle={false} action />
      <div className="mx-auto max-w-[1248px] px-6 py-8">
        <DataTableSkeleton columns={["flex-1", "w-24", "w-16", "w-10"]} />
      </div>
    </main>
  );
}
