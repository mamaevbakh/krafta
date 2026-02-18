"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { headers } from "next/headers";
import { buildKraftaLoginUrl, getRequestOrigin } from "@/lib/auth-redirect";

export async function signOutAction() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  const origin = getRequestOrigin(await headers());
  redirect(buildKraftaLoginUrl(`${origin}/dashboard`));
}
