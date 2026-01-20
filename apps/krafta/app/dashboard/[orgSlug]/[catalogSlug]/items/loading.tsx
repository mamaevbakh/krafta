import { Spinner } from "@/components/ui/spinner"

export default function ItemsLoading() {
  return (
    <div className="mx-auto flex w-full max-w-[1248px] items-center justify-center px-6 py-20">
      <Spinner className="size-5 text-muted-foreground" />
    </div>
  )
}
