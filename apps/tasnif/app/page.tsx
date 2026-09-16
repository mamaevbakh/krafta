// Placeholder until the search UI lands (plan step 4). Kept deliberately bare:
// no design decisions are being made here, only proof that the app builds and
// serves inside the monorepo.
export default function Home() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-2xl flex-col justify-center gap-3 px-6">
      <h1 className="text-[32px] font-medium tracking-tight">Поиск ИКПУ</h1>
      <p className="text-muted-foreground">
        Опишите товар или услугу своими словами — на русском, узбекском или
        английском — и получите правильный код ИКПУ.
      </p>
    </main>
  );
}
