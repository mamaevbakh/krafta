import Link from "next/link";

export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col items-center justify-center gap-4 px-6 text-center">
      <h1 className="text-4xl font-semibold">Krafta Auth</h1>
      <p className="text-sm text-zinc-300">
        Centralized authentication broker for Krafta applications.
      </p>
      <Link href="/login" className="rounded-md bg-white px-4 py-2 text-black">
        Sign in
      </Link>
    </main>
  );
}
