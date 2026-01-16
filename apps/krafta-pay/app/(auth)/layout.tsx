import type { ReactNode } from "react";

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-black flex items-center justify-center px-6 py-16">
      <div className="w-full max-w-md">{children}</div>
    </div>
  );
}
