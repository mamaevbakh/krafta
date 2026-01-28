import { Spinner } from "@/components/ui/spinner";

export default function LoginLoading() {
  return (
    <div className="bg-muted flex min-h-svh flex-col items-center justify-center">
      <Spinner className="size-8" />
    </div>
  );
}
