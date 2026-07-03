import {
  DashboardHeaderSkeleton,
  DataTableSkeleton,
} from "@/components/dashboard/skeletons";

export default function ItemsLoading() {
  return (
    <>
      <DashboardHeaderSkeleton subtitle={false} action />
      <div className="mx-auto max-w-[1248px] px-5 py-4">
        <DataTableSkeleton statusTabs />
      </div>
    </>
  );
}
