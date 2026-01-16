import { Spinner } from "@/components/ui/spinner";

export default function PreviewLoading() {
  return (
    <div className="min-h-screen w-screen flex items-center justify-center">
      <Spinner className="size-6" />
    </div>
  );
}
