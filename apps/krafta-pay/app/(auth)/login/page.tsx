import { headers } from "next/headers";
import { redirect } from "next/navigation";
import {
  buildKraftaLoginUrl,
  getRequestOrigin,
  normalizePayNext,
} from "@/lib/auth-redirect";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string | string[] }>;
}) {
  const sp = await searchParams;
  const rawNext = Array.isArray(sp.next) ? sp.next[0] : sp.next;
  const origin = getRequestOrigin(await headers());
  const next = normalizePayNext(rawNext, origin);
  redirect(buildKraftaLoginUrl(next));
}
