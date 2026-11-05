import 'server-only';
import { z } from 'zod';
import { generateTemporaryPassword, hashPassword } from '@/server/auth/password';
import { revokeUserSessions } from '@/server/auth/session';
import { recordAudit } from '@/server/audit/audit';
import { withTenant } from '@/server/db/client';
import { systemDb } from '@/server/db/system';
import { AppError, forbidden, notFound } from '@/server/http/errors';
import type { AuthedContext } from '@/server/http/route';

/**
 * Break-glass support (spec §2.7, §9.6; plan Phase 5). The Platform Owner has no standing access to school data.
 *  1. They request access with a reason and a duration (15 min – 8 h).
 *  2. The school's School Admin approves or denies it; they can end it at any time.
 *  3. While active, the owner gets a read-only support view; every view is written to the school's audit log
 *     with the grant id, so the school sees exactly what was looked at and when.
 * Separately, if the school is locked out, the owner can reset a School Admin's password with a written reason;
 * that is audited in the school and every School Admin is notified.
 */

export const requestSupportSchema = z.object({
  reason: z.string().trim().min(10, 'Explain why in a sentence (at least 10 characters)').max(500),
  durationMinutes: z.union([z.literal(30), z.literal(60), z.literal(120), z.literal(240)]),
  ticketId: z.string().uuid().optional(),
});

/** Platform console users who may work with support access: the Owner, or a Platform Admin granted it. */
export function canUseSupportAccess(ctx: AuthedContext) {
  return ctx.can('platform.tenants.manage') || ctx.can('platform.support.access');
}

const meta = (ctx: AuthedContext) => ({ requestId: ctx.requestId, ipHash: ctx.ipHash, userAgent: ctx.userAgent });

async function schoolAdmins(tenantId: string) {
  return systemDb().user.findMany({
    where: { tenantId, role: 'SCHOOL_ADMIN', status: 'ACTIVE', deletedAt: null },
    select: { id: true, displayName: true, email: true, lockedUntil: true, lastLoginAt: true },
  });
}

async function notifyAdmins(tenantId: string, n: { title: string; body: string; link: string }) {
  const admins = await schoolAdmins(tenantId);
  if (!admins.length) return;
  await systemDb().notification.createMany({
    data: admins.map((a) => ({ tenantId, userId: a.id, kind: 'support', title: n.title, body: n.body, link: n.link })),
  });
}

/** Lazily expire grants whose time is up (the daily job also sweeps them). */
export async function expireGrants(tenantId?: string) {
  const r = await systemDb().supportGrant.updateMany({
    where: { status: 'ACTIVE', expiresAt: { lte: new Date() }, ...(tenantId ? { tenantId } : {}) },
    data: { status: 'EXPIRED', endedAt: new Date() },
  });
  return r.count;
}

export async function tenantSupportSummary(tenantId: string) {
  await expireGrants(tenantId);
  const db = systemDb();
  const tenant = await db.tenant.findUnique({
    where: { id: tenantId },
    select: { id: true, name: true, prefix: true, status: true, city: true, createdAt: true },
  });
  if (!tenant) throw notFound('School');
  const [grants, admins] = await Promise.all([
    db.supportGrant.findMany({ where: { tenantId }, orderBy: { createdAt: 'desc' }, take: 20 }),
    schoolAdmins(tenantId),
  ]);
  return {
    tenant,
    grants,
    active: grants.find((g) => g.status === 'ACTIVE') ?? null,
    pending: grants.find((g) => g.status === 'PENDING' || g.status === 'AWAITING_OWNER') ?? null,
    // Metadata only: who the School Admins are, so a locked-out school can be helped.
    admins: admins.map((a) => ({
      id: a.id,
      name: a.displayName,
      email: a.email,
      locked: !!a.lockedUntil && a.lockedUntil > new Date(),
      lastLoginAt: a.lastLoginAt,
    })),
  };
}

export async function requestSupport(
  ctx: AuthedContext,
  tenantId: string,
  input: z.infer<typeof requestSupportSchema>,
) {
  const db = systemDb();
  const tenant = await db.tenant.findUnique({ where: { id: tenantId } });
  if (!tenant) throw notFound('School');
  await expireGrants(tenantId);
  const open = await db.supportGrant.findFirst({
    where: { tenantId, status: { in: ['AWAITING_OWNER', 'PENDING', 'ACTIVE'] } },
  });
  if (open)
    throw new AppError(
      'CONFLICT',
      open.status === 'ACTIVE' ? 'Support access is already active' : 'A request for this school is already waiting',
    );
  if (input.ticketId && !(await db.supportTicket.findFirst({ where: { id: input.ticketId, tenantId } })))
    throw notFound('Ticket');
  // Spec §9.6: a Platform Admin goes through the same flow with the Platform Owner as approver first.
  const byAdmin = ctx.user.role === 'PLATFORM_ADMIN';
  const g = await db.supportGrant.create({
    data: {
      tenantId,
      requestedBy: ctx.user.id,
      requesterName: ctx.user.displayName,
      reason: input.reason,
      durationMinutes: input.durationMinutes,
      ticketId: input.ticketId ?? null,
      status: byAdmin ? 'AWAITING_OWNER' : 'PENDING',
    },
  });
  await recordAudit({
    tenantId,
    actorId: ctx.user.id,
    actorRole: ctx.user.role,
    action: 'support.request',
    entity: 'SupportGrant',
    entityId: g.id,
    after: { reason: input.reason, minutes: input.durationMinutes },
    supportGrantId: g.id,
    ...meta(ctx),
  });
  if (!byAdmin) await notifySchoolOfRequest(tenantId, g);
  return g;
}

async function notifySchoolOfRequest(
  tenantId: string,
  g: { requesterName: string; durationMinutes: number; reason: string },
) {
  await notifyAdmins(tenantId, {
    title: 'Support access requested',
    body: `${g.requesterName} (EDUsaas support) asks for read-only access for ${g.durationMinutes / 60 >= 1 ? `${g.durationMinutes / 60} h` : `${g.durationMinutes} min`}: ${g.reason}`,
    link: '/staff/settings#support',
  });
}

/** Requests from Platform Admins waiting for the Owner (spec §9.6). */
export async function awaitingOwner() {
  const rows = await systemDb().supportGrant.findMany({
    where: { status: 'AWAITING_OWNER' },
    orderBy: { createdAt: 'asc' },
    include: { tenant: { select: { id: true, name: true } } },
  });
  return rows.map((g) => ({
    id: g.id,
    school: g.tenant,
    requester: g.requesterName,
    reason: g.reason,
    minutes: g.durationMinutes,
    createdAt: g.createdAt,
  }));
}

export const ownerDecisionSchema = z.object({ decision: z.enum(['APPROVE', 'DENY']) });

/** The Owner approves (the request then goes to the school, which still decides) or denies it. */
export async function ownerDecision(ctx: AuthedContext, id: string, input: z.infer<typeof ownerDecisionSchema>) {
  const db = systemDb();
  const g = await db.supportGrant.findUnique({ where: { id } });
  if (!g || g.status !== 'AWAITING_OWNER') throw notFound('Request');
  await db.supportGrant.update({
    where: { id },
    data:
      input.decision === 'APPROVE'
        ? { status: 'PENDING', ownerApprovedBy: ctx.user.id }
        : { status: 'DENIED', endedAt: new Date() },
  });
  await recordAudit({
    tenantId: g.tenantId,
    actorId: ctx.user.id,
    actorRole: ctx.user.role,
    action: input.decision === 'APPROVE' ? 'support.owner_approve' : 'support.owner_deny',
    entity: 'SupportGrant',
    entityId: id,
    supportGrantId: id,
    metadata: { requester: g.requesterName },
    ...meta(ctx),
  });
  if (input.decision === 'APPROVE') await notifySchoolOfRequest(g.tenantId, g);
  return { ok: true };
}

export async function endSupportByPlatform(ctx: AuthedContext, tenantId: string) {
  const db = systemDb();
  const g = await db.supportGrant.findFirst({
    where: { tenantId, status: { in: ['AWAITING_OWNER', 'PENDING', 'ACTIVE'] } },
  });
  if (!g) throw notFound('Support access');
  // A Platform Admin can only withdraw or end their own access; the Owner can end anyone's.
  if (!ctx.can('platform.tenants.manage') && g.requestedBy !== ctx.user.id) throw notFound('Support access');
  await db.supportGrant.update({
    where: { id: g.id },
    data: { status: g.status === 'ACTIVE' ? 'REVOKED' : 'DENIED', endedAt: new Date() },
  });
  await recordAudit({
    tenantId,
    actorId: ctx.user.id,
    actorRole: ctx.user.role,
    action: g.status === 'ACTIVE' ? 'support.end' : 'support.withdraw',
    entity: 'SupportGrant',
    entityId: g.id,
    supportGrantId: g.id,
    ...meta(ctx),
  });
  return { ok: true };
}

/**
 * Read-only support view. Requires an ACTIVE, unexpired grant requested by this owner. Data is read through
 * the tenant's RLS context (not the bypass role), and the view itself is audited in the school.
 */
export async function supportView(ctx: AuthedContext, tenantId: string) {
  await expireGrants(tenantId);
  const g = await systemDb().supportGrant.findFirst({
    where: { tenantId, status: 'ACTIVE', expiresAt: { gt: new Date() } },
  });
  if (!g) throw forbidden('The school hasn’t granted support access (or it has ended)');
  if (g.requestedBy !== ctx.user.id) throw forbidden('This support access was granted to someone else');
  const data = await withTenant({ tenantId }, async (tx) => {
    const year = await tx.academicYear.findFirst({ where: { status: 'CURRENT' } });
    const [students, teachers, sections, staff, settings, recent, imports] = await Promise.all([
      tx.student.count({ where: { status: 'ACTIVE' } }),
      tx.teacher.count(),
      year ? tx.section.count({ where: { class: { academicYearId: year.id } } }) : 0,
      tx.user.findMany({
        where: { role: { notIn: ['STUDENT', 'TEACHER'] }, deletedAt: null },
        select: { displayName: true, role: true, status: true, lastLoginAt: true },
      }),
      tx.tenantSettings.findFirst(),
      tx.auditLog.findMany({
        orderBy: { createdAt: 'desc' },
        take: 30,
        select: { action: true, actorRole: true, outcome: true, createdAt: true },
      }),
      tx.job.findMany({
        where: { type: 'student_import' },
        orderBy: { createdAt: 'desc' },
        take: 5,
        select: { status: true, createdAt: true, progress: true, error: true },
      }),
    ]);
    return { year: year?.name ?? null, students, teachers, sections, staff, settings, recent, imports };
  });
  await recordAudit({
    tenantId,
    actorId: ctx.user.id,
    actorRole: ctx.user.role,
    action: 'support.view',
    entity: 'Tenant',
    entityId: tenantId,
    metadata: { page: 'overview' },
    supportGrantId: g.id,
    ...meta(ctx),
  });
  return { grant: { id: g.id, expiresAt: g.expiresAt!, reason: g.reason }, ...data };
}

export const adminResetSchema = z.object({
  userId: z.string().uuid(),
  reason: z.string().trim().min(10, 'Explain why in a sentence (at least 10 characters)').max(500),
  confirm: z.literal('RESET'),
});

/** Emergency: the school is locked out. Gives a one-time password for one School Admin; fully visible to the school. */
export async function emergencyAdminReset(
  ctx: AuthedContext,
  tenantId: string,
  input: z.infer<typeof adminResetSchema>,
) {
  const db = systemDb();
  const user = await db.user.findFirst({
    where: { id: input.userId, tenantId, role: 'SCHOOL_ADMIN', deletedAt: null },
  });
  if (!user) throw notFound('School Admin');
  const temporaryPassword = generateTemporaryPassword();
  await db.user.update({
    where: { id: user.id },
    data: {
      passwordHash: await hashPassword(temporaryPassword),
      mustChangePassword: true,
      failedLoginAttempts: 0,
      lockedUntil: null,
      status: 'ACTIVE',
    },
  });
  const sessions = await revokeUserSessions(user.id);
  await recordAudit({
    tenantId,
    actorId: ctx.user.id,
    actorRole: ctx.user.role,
    action: 'support.admin_reset',
    entity: 'User',
    entityId: user.id,
    metadata: { reason: input.reason, admin: user.displayName, sessionsRevoked: sessions },
    ...meta(ctx),
  });
  await notifyAdmins(tenantId, {
    title: 'A School Admin password was reset by EDUsaas support',
    body: `${ctx.user.displayName} reset the password for ${user.displayName}. Reason: ${input.reason}`,
    link: '/staff/audit?category=support',
  });
  return { name: user.displayName, email: user.email, temporaryPassword };
}
