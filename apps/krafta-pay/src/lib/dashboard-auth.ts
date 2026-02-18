import { createClient } from "@/lib/supabase/server";
import { getUserSafely } from "@/lib/safe-auth";

export type OrgRole = "owner" | "admin" | "member";

const ROLE_RANK: Record<OrgRole, number> = {
  owner: 3,
  admin: 2,
  member: 1,
};

export async function getAuthenticatedUserOrThrow() {
  const supabase = await createClient();
  const { user, authError } = await getUserSafely(supabase);
  if (authError) throw new Error("unauthorized");
  if (!user) throw new Error("unauthorized");
  return { supabase, user };
}

export async function requireOrgMembership(params: {
  supabase: Awaited<ReturnType<typeof createClient>>;
  userId: string;
  orgId: string;
  minRole?: OrgRole;
}) {
  const { data: membership, error } = await params.supabase
    .from("organization_members")
    .select("id, role")
    .eq("org_id", params.orgId)
    .eq("user_id", params.userId)
    .maybeSingle();

  if (error) throw error;
  if (!membership) throw new Error("forbidden");

  if (params.minRole) {
    const currentRank = ROLE_RANK[membership.role as OrgRole] ?? 0;
    const requiredRank = ROLE_RANK[params.minRole] ?? 0;
    if (currentRank < requiredRank) {
      throw new Error("insufficient_role");
    }
  }

  return membership;
}
