import { prisma } from '@/lib/prisma';
import type { AuditAction } from '@prisma/client';
export async function audit(input:{tenantId?:string|null;actorId?:string|null;action:AuditAction;entity:string;entityId?:string|null;metadata?:unknown;request?:Request}){
  return prisma.auditLog.create({data:{tenantId:input.tenantId??undefined,actorId:input.actorId??undefined,action:input.action,entity:input.entity,entityId:input.entityId??undefined,metadata:input.metadata as any,ipAddress:input.request?.headers.get('x-forwarded-for')?.split(',')[0]?.trim(),userAgent:input.request?.headers.get('user-agent')}});
}
