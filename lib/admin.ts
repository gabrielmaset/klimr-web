import "server-only";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export type AdminRole = "support" | "admin" | "superadmin";
const RANK: Record<AdminRole, number> = { support: 1, admin: 2, superadmin: 3 };

function isRole(v: unknown): v is AdminRole {
  return v === "support" || v === "admin" || v === "superadmin";
}

/** The signed-in user's admin role, or null. Reads only the caller's own role. */
export async function getAdminRole(): Promise<{ userId: string; role: AdminRole } | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase.rpc("current_admin_role");
  return isRole(data) ? { userId: user.id, role: data } : null;
}

export function atLeast(role: AdminRole, min: AdminRole): boolean {
  return RANK[role] >= RANK[min];
}

/**
 * Gate an admin route. Non-admins are sent home (we don't reveal /admin exists);
 * admins below the required level are sent back to the admin overview.
 */
export async function requireAdmin(min: AdminRole = "support"): Promise<{ userId: string; role: AdminRole }> {
  const a = await getAdminRole();
  if (!a) redirect("/");
  if (!atLeast(a.role, min)) redirect("/admin");
  return a;
}

/** Append-only audit trail for staff actions. */
export async function logAdminAction(
  actorId: string,
  action: string,
  targetUserId: string | null,
  detail?: string,
  targetRef?: string,
): Promise<void> {
  const admin = createAdminClient();
  await admin.from("admin_actions").insert({
    actor_id: actorId,
    action,
    target_user_id: targetUserId,
    target_ref: targetRef ?? null,
    detail: detail ?? null,
  });
}
