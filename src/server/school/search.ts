import 'server-only';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { normalizeUsername } from '@/server/auth/username';
import type { AuthedContext } from '@/server/http/route';
import { inTenant, teacherScope } from '@/server/school/common';

/**
 * Global search (spec §8.9), role-scoped:
 *  - Teacher: students in their own sections only.
 *  - Principal: students school-wide (read-only).
 *  - Admissions Officer / School Admin: students school-wide plus guardian-phone lookup.
 *  - Teachers list: anyone with teachers.read.
 * Fuzzy matching uses pg_trgm (typos still match); every student row shows section + username.
 */

export const searchQuery = z.object({
  q: z.string().trim().min(2, 'Type at least 2 characters').max(80),
  page: z.coerce.number().int().min(1).max(50).default(1),
});

const PAGE = 20;
const likeEscape = (s: string) => s.replace(/[\\%_]/g, (m) => `\\${m}`);

export async function search(ctx: AuthedContext, query: z.infer<typeof searchQuery>) {
  const q = query.q;
  const like = `%${likeEscape(q)}%`;
  const userNorm = normalizeUsername(q);
  // A query of only symbols normalises to '' — that must not turn into "match every username".
  const userLike = userNorm ? `%${likeEscape(userNorm)}%` : null;
  const digits = q.replace(/\D/g, '');
  const phoneLookup =
    digits.length >= 4 && (ctx.user.role === 'SCHOOL_ADMIN' || ctx.user.role === 'ADMISSIONS_OFFICER');
  const offset = (query.page - 1) * PAGE;

  return inTenant(ctx, async (tx) => {
    let scope: string[] | null = null;
    if (ctx.user.role === 'TEACHER') scope = (await teacherScope(tx, ctx.user.id)).sectionIds;
    const scopeSql = scope
      ? scope.length
        ? Prisma.sql`AND s.section_id = ANY(${scope}::uuid[])`
        : Prisma.sql`AND FALSE`
      : Prisma.empty;
    const phoneSql = phoneLookup ? Prisma.sql`OR s.guardian_phone LIKE ${`%${digits}%`}` : Prisma.empty;

    const students = await tx.$queryRaw<
      {
        id: string;
        name: string;
        username: string | null;
        roll_number: number | null;
        section: string | null;
        status: string;
        score: number;
      }[]
    >`
      SELECT s.id, u.display_name AS name, u.username, s.roll_number, s.status::text AS status,
             CASE WHEN c.name IS NULL THEN NULL ELSE c.name || '-' || sec.name END AS section,
             GREATEST(similarity(u.display_name, ${q}), similarity(COALESCE(u.username_normalized, ''), ${userNorm})) AS score
      FROM students s
      JOIN users u ON u.id = s.user_id
      LEFT JOIN sections sec ON sec.id = s.section_id
      LEFT JOIN classes c ON c.id = sec.class_id
      WHERE s.status IN ('ACTIVE', 'WITHDRAWN') ${scopeSql}
        AND (u.display_name ILIKE ${like} OR u.display_name % ${q} OR ${userLike ? Prisma.sql`u.username_normalized LIKE ${userLike}` : Prisma.sql`FALSE`}
             OR s.admission_no ILIKE ${like} ${phoneSql})
      ORDER BY (s.status = 'ACTIVE') DESC, (u.display_name ILIKE ${like}) DESC, score DESC, u.display_name
      LIMIT ${PAGE + 1} OFFSET ${offset}`;

    let teachers: { id: string; name: string; username: string | null; score: number }[] = [];
    if (ctx.can('teachers.read')) {
      teachers = await tx.$queryRaw`
        SELECT t.id, u.display_name AS name, u.username, similarity(u.display_name, ${q}) AS score
        FROM teachers t JOIN users u ON u.id = t.user_id
        WHERE u.deleted_at IS NULL AND (u.display_name ILIKE ${like} OR u.display_name % ${q} OR ${userLike ? Prisma.sql`u.username_normalized LIKE ${userLike}` : Prisma.sql`FALSE`})
        ORDER BY (u.display_name ILIKE ${like}) DESC, score DESC, u.display_name
        LIMIT 8`;
    }

    return {
      q,
      page: query.page,
      students: students.slice(0, PAGE).map((s) => ({
        id: s.id,
        name: s.name,
        username: s.username,
        rollNumber: s.roll_number,
        section: s.section ?? 'Unplaced',
        withdrawn: s.status !== 'ACTIVE',
      })),
      hasMore: students.length > PAGE,
      teachers: teachers.map((t) => ({ id: t.id, name: t.name, username: t.username })),
    };
  });
}
