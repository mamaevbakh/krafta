import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/supabase/types";
import { mediaPathOrgId, requireOrgMediaRole } from "../_lib/authorize";

const BUCKET_NAME = "public-assets";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as {
    entries?: Array<{ bucket?: string; storage_path?: string }>;
  } | null;

  const entries = body?.entries ?? [];

  if (!entries.length) {
    return NextResponse.json(
      { error: "Missing cleanup data." },
      { status: 400 },
    );
  }

  // This route deletes storage objects with the service-role client, so it
  // only accepts paths the upload-url route mints (org/<orgId>/catalog/…)
  // inside the media bucket — anything else is silently skipped, same as
  // the pre-existing behavior for malformed entries. The org id embedded
  // in each path decides who may delete it.
  const paths: string[] = [];
  const orgIds = new Set<string>();
  entries.forEach((entry) => {
    if (entry.bucket !== BUCKET_NAME || !entry.storage_path) return;
    const orgId = mediaPathOrgId(entry.storage_path);
    if (!orgId) return;
    orgIds.add(orgId);
    paths.push(entry.storage_path);
  });

  if (!paths.length) {
    return NextResponse.json({ ok: true });
  }

  const auth = await requireOrgMediaRole([...orgIds]);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const supabaseUrl =
    process.env.KRAFTA_SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.KRAFTA_SUPABASE_SECRET_KEY ?? process.env.KRAFTA_SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SECRET_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    return NextResponse.json(
      { error: "Supabase configuration missing." },
      { status: 500 },
    );
  }

  const supabase = createClient<Database>(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });

  await supabase.storage.from(BUCKET_NAME).remove(paths);

  return NextResponse.json({ ok: true });
}
