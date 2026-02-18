import { createClient } from "@/lib/supabase/server";

export type MembershipOption = {
  orgId: string;
  orgName: string;
  orgSlug: string;
  role: "owner" | "admin" | "member";
};

export async function getCurrentUserMemberships(): Promise<MembershipOption[]> {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return [];

  const { data, error } = await supabase
    .from("organization_members")
    .select("org_id, role, organizations!inner(id, name, slug)")
    .eq("user_id", auth.user.id)
    .order("created_at", { ascending: true });
  if (error) return [];

  const rows = (data ?? []) as Array<{
    org_id: string;
    role: "owner" | "admin" | "member";
    organizations: { id: string; name: string; slug: string };
  }>;

  return rows
    .map((row) => ({
      orgId: row.org_id,
      orgName: row.organizations?.name,
      orgSlug: row.organizations?.slug,
      role: row.role,
    }))
    .filter((row) => Boolean(row.orgId));
}
