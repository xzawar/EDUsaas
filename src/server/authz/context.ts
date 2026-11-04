import 'server-only';
import type { UserRole } from '@prisma/client';
import { withTenant } from '@/server/db/client';
import { ROLE_POLICIES, effectivePermissions, type Permission } from '@/server/authz/permissions';

/** Effective permissions for a signed-in user: fixed role policy + this school's toggles (read under RLS). */
export async function loadPermissions(user: {
  id: string;
  role: UserRole;
  tenantId: string | null;
}): Promise<Set<Permission>> {
  const configurable = Object.keys(ROLE_POLICIES[user.role].configurable);
  if (!user.tenantId || configurable.length === 0) return effectivePermissions(user.role);
  const rows = await withTenant({ tenantId: user.tenantId, userId: user.id }, (tx) =>
    tx.tenantRolePermission.findMany({ where: { role: user.role }, select: { permission: true, granted: true } }),
  );
  return effectivePermissions(user.role, Object.fromEntries(rows.map((r) => [r.permission, r.granted])));
}
