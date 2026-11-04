import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { getCurrentUser } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { normalizeUsername, usernamePart } from '@/lib/security';
import { audit } from '@/lib/audit';

const schema = z.object({
  name: z.string().min(2).max(120),
  admissionNo: z.string().max(50).optional(),
  rollNumber: z.number().int().min(1).max(10000).optional(),
  sectionId: z.string().optional(),
  password: z.string().min(8).max(100),
});

export async function POST(req: Request) {
  const u = await getCurrentUser();
  if (!u?.tenantId || !['SCHOOL_ADMIN', 'PRINCIPAL', 'ADMISSIONS_OFFICER'].includes(u.role)) {
    return NextResponse.json({ error: { message: 'Forbidden' } }, { status: 403 });
  }
  if (u.role === 'PRINCIPAL' && !u.tenant?.settings?.principalCanStudents) {
    return NextResponse.json({ error: { message: 'Permission disabled by School Admin' } }, { status: 403 });
  }
  try {
    const b = schema.parse(await req.json());
    let classPart = '';
    if (b.sectionId) {
      const section = await prisma.section.findFirst({
        where: { id: b.sectionId, tenantId: u.tenantId },
        include: { class: true },
      });
      if (!section) return NextResponse.json({ error: { message: 'Section not found' } }, { status: 404 });
      classPart = `-${usernamePart(section.class.name)}-${usernamePart(section.name)}`;
    }
    const base = `${usernamePart(u.tenant!.nickname)}${classPart}-${usernamePart(b.name)}${b.rollNumber ? `-${b.rollNumber}` : ''}`;
    let username = base;
    let i = 0;
    while (await prisma.user.findUnique({ where: { usernameNormalized: normalizeUsername(username) } })) {
      i += 1;
      username = `${base}${i}`;
    }
    const hash = await bcrypt.hash(b.password, 12);
    const student = await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          username,
          usernameNormalized: normalizeUsername(username),
          passwordHash: hash,
          role: 'STUDENT',
          displayName: b.name,
          tenantId: u.tenantId!,
        },
      });
      return tx.student.create({
        data: {
          tenantId: u.tenantId!,
          userId: user.id,
          admissionNo: b.admissionNo || null,
          rollNumber: b.rollNumber ?? null,
          currentSectionId: b.sectionId || null,
        },
      });
    });
    await audit({ tenantId: u.tenantId, actorId: u.id, action: 'CREATE', entity: 'Student', entityId: student.id, request: req });
    const full = await prisma.student.findUnique({
      where: { id: student.id },
      include: { user: true, currentSection: { include: { class: true } } },
    });
    return NextResponse.json({
      student: {
        id: full!.id,
        name: full!.user.displayName,
        username: full!.user.username,
        admissionNo: full!.admissionNo || '',
        rollNumber: full!.rollNumber || null,
        status: full!.status,
        section: full!.currentSection ? `${full!.currentSection.class.name}-${full!.currentSection.name}` : 'Unassigned',
        photoUrl: full!.user.photoUrl || null,
      },
    }, { status: 201 });
  } catch (e: any) {
    return NextResponse.json({ error: { message: e?.message || 'Could not create student' } }, { status: 400 });
  }
}
