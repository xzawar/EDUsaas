import 'server-only';
import { z } from 'zod';
import { STORAGE_MISSING, newKey, storage } from '@/server/files/storage';
import { AppError, notFound } from '@/server/http/errors';
import type { AuthedContext } from '@/server/http/route';
import { audit, inTenant, teacherScope } from '@/server/school/common';

/**
 * Profile photos (spec Phase 2, §9.5, §12.1). The browser crops to a square and shrinks it before upload, so no
 * high-resolution original is ever stored. The server trusts none of that: it checks the real bytes (content
 * sniffing, not the name or declared type), caps the size, stores under a random key and audits the change.
 * Photos are private: they are streamed back only after the same access check as the person's profile.
 */

export const MAX_PHOTO_BYTES = 300 * 1024;
export const photoSchema = z.object({
  data: z
    .string()
    .min(16)
    .max(Math.ceil((MAX_PHOTO_BYTES * 4) / 3) + 16),
});

function sniff(buf: Uint8Array): { type: string; ext: string } | null {
  if (buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff)
    return { type: 'image/jpeg', ext: 'jpg' };
  if (buf.length > 8 && [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((b, i) => buf[i] === b))
    return { type: 'image/png', ext: 'png' };
  if (
    buf.length > 12 &&
    String.fromCharCode(...buf.subarray(0, 4)) === 'RIFF' &&
    String.fromCharCode(...buf.subarray(8, 12)) === 'WEBP'
  )
    return { type: 'image/webp', ext: 'webp' };
  return null;
}

export function decodePhoto(base64: string) {
  const buf = new Uint8Array(Buffer.from(base64, 'base64'));
  if (buf.length === 0) throw new AppError('VALIDATION_FAILED', 'The photo is empty');
  if (buf.length > MAX_PHOTO_BYTES)
    throw new AppError('VALIDATION_FAILED', 'The photo is too large (max 300 KB after cropping)');
  const kind = sniff(buf);
  if (!kind) throw new AppError('VALIDATION_FAILED', 'Upload a JPEG, PNG or WebP image');
  return { buf, ...kind };
}

type Who = { kind: 'student' | 'teacher'; id: string };

async function load(ctx: AuthedContext, who: Who) {
  return inTenant(ctx, async (tx) => {
    if (who.kind === 'student') {
      const s = await tx.student.findUnique({
        where: { id: who.id },
        select: { id: true, photoKey: true, sectionId: true, userId: true },
      });
      if (!s) return null;
      if (ctx.user.role === 'STUDENT' && s.userId !== ctx.user.id) return null;
      if (ctx.user.role === 'TEACHER') {
        const scope = await teacherScope(tx, ctx.user.id);
        if (!s.sectionId || !scope.sectionIds.includes(s.sectionId)) return null;
      }
      return { id: s.id, photoKey: s.photoKey };
    }
    const t = await tx.teacher.findUnique({
      where: { id: who.id },
      select: { id: true, photoKey: true, userId: true },
    });
    if (!t) return null;
    if (ctx.user.role === 'STUDENT') return null;
    return { id: t.id, photoKey: t.photoKey };
  });
}

export async function setPhoto(ctx: AuthedContext, who: Who, input: z.infer<typeof photoSchema>) {
  const store = storage();
  if (!store) throw new AppError('CONFLICT', STORAGE_MISSING);
  const row = await load(ctx, who);
  if (!row) throw notFound(who.kind === 'student' ? 'Student' : 'Teacher');
  const { buf, type, ext } = decodePhoto(input.data);
  const key = `${newKey('photos', ctx.tenantId!, `${who.kind}s`)}.${ext}`;
  await store.put(key, buf, type);
  await inTenant(ctx, async (tx) => {
    if (who.kind === 'student') await tx.student.update({ where: { id: who.id }, data: { photoKey: key } });
    else await tx.teacher.update({ where: { id: who.id }, data: { photoKey: key } });
    await audit(ctx, tx, {
      action: `${who.kind}.photo`,
      entity: who.kind === 'student' ? 'Student' : 'Teacher',
      entityId: who.id,
      metadata: { bytes: buf.length, type, replaced: !!row.photoKey },
    });
  });
  if (row.photoKey) await store.delete(row.photoKey).catch(() => undefined);
  return { ok: true, version: photoVersion(key) };
}

export async function removePhoto(ctx: AuthedContext, who: Who) {
  const row = await load(ctx, who);
  if (!row) throw notFound(who.kind === 'student' ? 'Student' : 'Teacher');
  if (!row.photoKey) return { ok: true };
  await inTenant(ctx, async (tx) => {
    if (who.kind === 'student') await tx.student.update({ where: { id: who.id }, data: { photoKey: null } });
    else await tx.teacher.update({ where: { id: who.id }, data: { photoKey: null } });
    await audit(ctx, tx, {
      action: `${who.kind}.photo_remove`,
      entity: who.kind === 'student' ? 'Student' : 'Teacher',
      entityId: who.id,
    });
  });
  await storage()
    ?.delete(row.photoKey)
    .catch(() => undefined);
  return { ok: true };
}

export async function photoResponse(ctx: AuthedContext, who: Who) {
  const row = await load(ctx, who);
  if (!row?.photoKey) throw notFound('Photo');
  const file = await storage()?.get(row.photoKey);
  if (!file) throw notFound('Photo');
  return new Response(file.body as unknown as BodyInit, {
    headers: {
      'Content-Type': file.contentType,
      'Cache-Control': 'private, max-age=86400',
      'X-Content-Type-Options': 'nosniff',
      'Content-Disposition': 'inline',
    },
  });
}

/** Short, non-guessable cache-buster derived from the (random) key — never the key itself. */
export function photoVersion(key: string | null | undefined) {
  return key ? key.slice(-10).replace(/\W/g, '') : null;
}

export async function myStudentId(ctx: AuthedContext) {
  const s = await inTenant(ctx, (tx) =>
    tx.student.findUnique({ where: { userId: ctx.user.id }, select: { id: true, photoKey: true } }),
  );
  if (!s) throw notFound('Student');
  return s;
}

/** URL for the signed-in student's/teacher's own photo, or null (sidebar avatar). */
export async function myPhotoUrl(ctx: AuthedContext): Promise<string | null> {
  if (!ctx.tenantId || (ctx.user.role !== 'STUDENT' && ctx.user.role !== 'TEACHER')) return null;
  const key = await inTenant(ctx, async (tx) =>
    ctx.user.role === 'STUDENT'
      ? (await tx.student.findUnique({ where: { userId: ctx.user.id }, select: { photoKey: true } }))?.photoKey
      : (await tx.teacher.findUnique({ where: { userId: ctx.user.id }, select: { photoKey: true } }))?.photoKey,
  );
  return key ? `/api/v1/me/photo?v=${photoVersion(key)}` : null;
}
