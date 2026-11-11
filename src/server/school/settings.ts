import 'server-only';
import { z } from 'zod';
import { withTenant } from '@/server/db/client';
import { auditInTx } from '@/server/audit/audit';
import { AppError } from '@/server/http/errors';
import type { AuthedContext } from '@/server/http/route';
import {
  CONFIGURABLE_ROLES,
  PERMISSIONS,
  ROLE_POLICIES,
  isConfigurable,
  type Permission,
} from '@/server/authz/permissions';

function requireTenant(ctx: AuthedContext): string {
  if (!ctx.tenantId) throw new AppError('FORBIDDEN', 'This action is only available to school accounts');
  return ctx.tenantId;
}

const validTimezone = (tz: string) => {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
};

export const updateSettingsSchema = z
  .object({
    timezone: z.string().max(64).refine(validTimezone, 'Unknown timezone'),
    attendanceMode: z.enum(['ONCE_DAILY', 'PER_PERIOD']),
    atRiskThreshold: z.number().int().min(0).max(100),
    marksPublisher: z.enum(['SCHOOL_ADMIN', 'PRINCIPAL']),
    leaveAgeOutHours: z.number().int().min(1).max(720),
    invoiceDay: z.number().int().min(1).max(28),
    feeDueDays: z.number().int().min(0).max(60),
    termStartMonths: z.array(z.number().int().min(1).max(12)).length(3),
    receiptFooter: z.string().trim().max(200).nullable(),
  })
  .partial()
  .strict()
  .refine((v) => Object.keys(v).length > 0, 'Nothing to update');

export async function getSchoolSettings(ctx: AuthedContext) {
  const tenantId = requireTenant(ctx);
  return withTenant({ tenantId, userId: ctx.user.id }, async (tx) => {
    const tenant = await tx.tenant.findFirstOrThrow({
      select: { id: true, name: true, prefix: true, status: true, city: true },
    });
    const settings = await tx.tenantSettings.findFirstOrThrow({ omit: { tenantId: true } });
    return { tenant, settings };
  });
}

export async function updateSchoolSettings(ctx: AuthedContext, input: z.infer<typeof updateSettingsSchema>) {
  const tenantId = requireTenant(ctx);
  return withTenant({ tenantId, userId: ctx.user.id }, async (tx) => {
    const before = await tx.tenantSettings.findFirstOrThrow({ omit: { tenantId: true, updatedAt: true } });
    const after = await tx.tenantSettings.update({ where: { tenantId }, data: input, omit: { tenantId: true } });
    await auditInTx(tx, {
      tenantId,
      actorId: ctx.user.id,
      actorRole: ctx.user.role,
      action: 'settings.update',
      entity: 'TenantSettings',
      entityId: tenantId,
      before: Object.fromEntries(Object.keys(input).map((k) => [k, before[k as keyof typeof before]])),
      after: input,
      requestId: ctx.requestId,
      ipHash: ctx.ipHash,
      userAgent: ctx.userAgent,
    });
    return after;
  });
}

export type PermissionMatrix = {
  role: (typeof CONFIGURABLE_ROLES)[number];
  fixed: { permission: Permission; label: string }[];
  configurable: { permission: Permission; label: string; granted: boolean; isDefault: boolean }[];
}[];

export async function getRolePermissions(ctx: AuthedContext): Promise<PermissionMatrix> {
  const tenantId = requireTenant(ctx);
  const rows = await withTenant({ tenantId, userId: ctx.user.id }, (tx) =>
    tx.tenantRolePermission.findMany({ select: { role: true, permission: true, granted: true } }),
  );
  return CONFIGURABLE_ROLES.map((role) => {
    const policy = ROLE_POLICIES[role];
    return {
      role,
      fixed: policy.fixed.map((p) => ({ permission: p, label: PERMISSIONS[p] })),
      configurable: (Object.entries(policy.configurable) as [Permission, boolean][]).map(([permission, def]) => {
        const row = rows.find((r) => r.role === role && r.permission === permission);
        return { permission, label: PERMISSIONS[permission], granted: row?.granted ?? def, isDefault: !row };
      }),
    };
  });
}

export const updateRolePermissionsSchema = z.object({
  changes: z
    .array(z.object({ role: z.enum(CONFIGURABLE_ROLES), permission: z.string().max(64), granted: z.boolean() }))
    .min(1)
    .max(50),
});

/** Spec §2.1/§2.2: only the School Admin configures Principal and Admissions Officer. Every change is audited. */
export async function updateRolePermissions(ctx: AuthedContext, input: z.infer<typeof updateRolePermissionsSchema>) {
  const tenantId = requireTenant(ctx);
  for (const c of input.changes) {
    if (!isConfigurable(c.role, c.permission)) {
      throw new AppError('VALIDATION_FAILED', `"${c.permission}" cannot be configured for ${c.role}`);
    }
  }
  await withTenant({ tenantId, userId: ctx.user.id }, async (tx) => {
    for (const c of input.changes) {
      const existing = await tx.tenantRolePermission.findFirst({ where: { role: c.role, permission: c.permission } });
      const before = existing?.granted ?? ROLE_POLICIES[c.role].configurable[c.permission as Permission];
      if (before === c.granted && existing) continue;
      await tx.tenantRolePermission.upsert({
        where: { tenantId_role_permission: { tenantId, role: c.role, permission: c.permission } },
        create: { tenantId, role: c.role, permission: c.permission, granted: c.granted, updatedBy: ctx.user.id },
        update: { granted: c.granted, updatedBy: ctx.user.id },
      });
      await auditInTx(tx, {
        tenantId,
        actorId: ctx.user.id,
        actorRole: ctx.user.role,
        action: 'permissions.update',
        entity: 'TenantRolePermission',
        entityId: `${c.role}:${c.permission}`,
        before: { granted: before },
        after: { granted: c.granted },
        requestId: ctx.requestId,
        ipHash: ctx.ipHash,
        userAgent: ctx.userAgent,
      });
    }
  });
  return getRolePermissions(ctx);
}
