import { Spinner } from "@/components/ui/spinner";

export default function PayLoading() {
  return (
    <div className="h-screen w-screen flex items-center justify-center">
      <Spinner className="size-6" />
    </div>
  );
}
