import {
  DashboardHeaderSkeleton,
  DataTableSkeleton,
} from "@/components/dashboard/skeletons";

export default function OrdersLoading() {
  return (
    <main className="w-full">
      <DashboardHeaderSkeleton action />
      <div className="mx-auto max-w-[1248px] space-y-4 px-5 py-4">
        <DataTableSkeleton
          statusTabs
          tabCount={4}
          columns={["w-24", "flex-1", "w-24", "w-20", "w-16"]}
        />
      </div>
    </main>
  );
}
