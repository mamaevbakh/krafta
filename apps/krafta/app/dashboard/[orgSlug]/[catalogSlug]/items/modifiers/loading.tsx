export default function Loading() {
  return (
    <main className="w-full">
      <div className="w-full border-b">
        <div className="mx-auto flex h-30 max-w-[1248px] items-center justify-between px-6">
          <div className="h-8 w-40 animate-pulse rounded-md bg-muted" />
          <div className="h-9 w-32 animate-pulse rounded-md bg-muted" />
        </div>
      </div>
      <div className="mx-auto max-w-[1248px] px-6 py-8">
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <div
              key={i}
              className="h-14 w-full animate-pulse rounded-md bg-muted/60"
            />
          ))}
        </div>
      </div>
    </main>
  );
}
