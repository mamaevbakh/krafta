import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/supabase/types";

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

  const supabaseUrl =
    process.env.KRAFTA_SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.KRAFTA_SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    return NextResponse.json(
      { error: "Supabase configuration missing." },
      { status: 500 },
    );
  }

  const supabase = createClient<Database>(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });

  const grouped: Record<string, string[]> = {};
  entries.forEach((entry) => {
    if (!entry.bucket || !entry.storage_path) return;
    if (!grouped[entry.bucket]) grouped[entry.bucket] = [];
    grouped[entry.bucket].push(entry.storage_path);
  });

  await Promise.all(
    Object.entries(grouped).map(([bucket, paths]) =>
      supabase.storage.from(bucket).remove(paths),
    ),
  );

  return NextResponse.json({ ok: true });
}
