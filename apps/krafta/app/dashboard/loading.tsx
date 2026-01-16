import { Spinner } from "@/components/ui/spinner";

export default function DashboardLoading() {
  return (
    <main className="h-screen w-screen">
      <div className="flex h-full w-full items-center justify-center">
        <Spinner className="size-6" />
      </div>
    </main>
  );
}
