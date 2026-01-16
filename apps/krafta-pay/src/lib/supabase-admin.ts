import { createClient } from "@supabase/supabase-js";
import type { Database } from "@krafta/supabase/database.types";

export function createAdminSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const secretKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY ??
    process.env.KRAFTA_SUPABASE_SERVICE_ROLE_KEY ??
    process.env.SUPABASE_SECRET_KEY!;

  return createClient<Database>(url, secretKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}
