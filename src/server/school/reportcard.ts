import 'server-only';
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib';
import { AppError, notFound } from '@/server/http/errors';
import type { AuthedContext } from '@/server/http/route';
import { studentRemarks, studentResults } from '@/server/school/assessments';
import { studentAttendance } from '@/server/school/attendance';
import { inTenant } from '@/server/school/common';
import { getStudent } from '@/server/school/people';

/**
 * On-demand report card (spec §7.5): generated when asked, never stored. Contains published marks only, the
 * year's attendance and approved remarks. Withdrawn students get none (plan §8, mid-year withdrawal).
 * Access: whoever may open the student (teachers: their own sections) and holds marks access, or the student.
 */

// The standard PDF fonts only cover Latin-1; anything else is replaced rather than failing the whole card.
const latin = (s: string) => s.normalize('NFKD').replace(/[^\x20-\x7E\xA0-\xFF]/g, '?');

export type Card = {
  school: string;
  year: string | null;
  name: string;
  section: string;
  rollNumber: number | null;
  admissionNo: string | null;
  attendance: { pct: number | null; present: number; late: number; absent: number; leave: number };
  subjects: {
    subject: string;
    pct: number | null;
    grade: string | null;
    tests: { name: string; score: number | null; max: number; absent: boolean }[];
  }[];
  remarks: { text: string; author: string; subject: string | null }[];
  threshold: number;
  generatedOn: string;
};

async function collect(ctx: AuthedContext, studentId: string): Promise<Card> {
  const s = await getStudent(ctx, studentId); // scoped: teachers only reach their own sections
  if (s.status !== 'ACTIVE')
    throw new AppError('VALIDATION_FAILED', 'Report cards are only issued for current students');
  const [results, att, remarks, school] = await Promise.all([
    studentResults(ctx, studentId),
    studentAttendance(ctx, studentId),
    studentRemarks(ctx, studentId, true),
    inTenant(ctx, (tx) => tx.tenant.findFirstOrThrow({ select: { name: true } })),
  ]);
  const bySubject = new Map<string, Card['subjects'][number]['tests']>();
  for (const i of results.items)
    bySubject.set(i.subject, [
      ...(bySubject.get(i.subject) ?? []),
      { name: i.name, score: i.score, max: i.maxMarks, absent: i.absent },
    ]);
  return {
    school: school.name,
    year: s.section?.year ?? null,
    name: s.name,
    section: s.section?.label ?? '—',
    rollNumber: s.rollNumber,
    admissionNo: s.admissionNo,
    attendance: {
      pct: att.pct,
      present: att.counts.PRESENT,
      late: att.counts.LATE,
      absent: att.counts.ABSENT,
      leave: att.counts.LEAVE + att.counts.EXCUSED,
    },
    subjects: results.subjects.map((x) => ({ ...x, tests: (bySubject.get(x.subject) ?? []).reverse() })),
    remarks: remarks.map((r) => ({ text: r.text, author: r.author, subject: r.subject })),
    threshold: att.threshold,
    generatedOn: att.today,
  };
}

function wrap(text: string, font: PDFFont, size: number, width: number): string[] {
  const out: string[] = [];
  let line = '';
  for (const word of latin(text).split(/\s+/)) {
    const next = line ? `${line} ${word}` : word;
    if (font.widthOfTextAtSize(next, size) > width && line) {
      out.push(line);
      line = word;
    } else line = next;
  }
  if (line) out.push(line);
  return out;
}

export async function renderReportCard(card: Card): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.setTitle(latin(`Report card - ${card.name}`));
  pdf.setProducer('EDUsaas');
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const ink = rgb(0.06, 0.09, 0.16);
  const muted = rgb(0.39, 0.45, 0.55);
  const line = rgb(0.89, 0.91, 0.94);
  const accent = rgb(0.06, 0.46, 0.43);
  const M = 48;
  let page: PDFPage = pdf.addPage([595.28, 841.89]); // A4
  const W = page.getWidth() - M * 2;
  let y = page.getHeight() - M;

  const text = (t: string, x: number, size = 10, f = font, color = ink) =>
    page.drawText(latin(t), { x, y, size, font: f, color });
  const ensure = (h: number) => {
    if (y - h < M + 40) {
      page = pdf.addPage([595.28, 841.89]);
      y = page.getHeight() - M;
    }
  };

  // Header
  text(card.school.toUpperCase(), M, 9, bold, accent);
  y -= 22;
  text('Report card', M, 22, bold);
  if (card.year)
    page.drawText(latin(`Academic year ${card.year}`), {
      x: M + W - font.widthOfTextAtSize(latin(`Academic year ${card.year}`), 10),
      y,
      size: 10,
      font,
      color: muted,
    });
  y -= 26;
  page.drawLine({ start: { x: M, y }, end: { x: M + W, y }, thickness: 1, color: line });
  y -= 22;

  // Student
  const facts: [string, string][] = [
    ['Student', card.name],
    ['Class', card.section],
    ['Roll no.', card.rollNumber ? String(card.rollNumber) : '—'],
    ['Admission no.', card.admissionNo ?? '—'],
  ];
  facts.forEach(([k, v], i) => {
    const x = M + (i % 2) * (W / 2);
    if (i % 2 === 0 && i > 0) y -= 30;
    text(k, x, 8, font, muted);
    page.drawText(latin(v), { x, y: y - 13, size: 11, font: bold, color: ink });
  });
  y -= 50;

  // Attendance
  ensure(70);
  text('Attendance', M, 12, bold);
  y -= 18;
  const a = card.attendance;
  const pct = a.pct === null ? 'Not recorded' : `${a.pct}%`;
  text(pct, M, 20, bold, a.pct !== null && a.pct < card.threshold ? rgb(0.73, 0.11, 0.11) : ink);
  text(`Present ${a.present} · Late ${a.late} · Absent ${a.absent} · Leave ${a.leave}`, M + 110, 10, font, muted);
  y -= 34;

  // Marks
  ensure(60);
  text('Marks', M, 12, bold);
  y -= 8;
  if (!card.subjects.length) {
    y -= 14;
    text('No marks have been published yet.', M, 10, font, muted);
    y -= 20;
  }
  const colTests = M + 120;
  const colPct = M + W - 90;
  const colGrade = M + W - 30;
  if (card.subjects.length) {
    y -= 16;
    text('SUBJECT', M, 8, bold, muted);
    text('TESTS', colTests, 8, bold, muted);
    text('OVERALL', colPct, 8, bold, muted);
    text('GRADE', colGrade - 6, 8, bold, muted);
    y -= 8;
  }
  for (const s of card.subjects) {
    const tests = s.tests
      .map((t) => `${t.name}: ${t.absent ? 'absent' : t.score === null ? '—' : `${t.score}/${t.max}`}`)
      .join('   ');
    const lines = wrap(tests, font, 9, colPct - colTests - 12);
    ensure(14 + lines.length * 12);
    page.drawLine({ start: { x: M, y }, end: { x: M + W, y }, thickness: 0.5, color: line });
    y -= 15;
    text(s.subject, M, 10, bold);
    text(s.pct === null ? '—' : `${s.pct}%`, colPct, 10, bold);
    text(s.grade ?? '—', colGrade, 10, bold, accent);
    lines.forEach((l, i) => page.drawText(l, { x: colTests, y: y - i * 12, size: 9, font, color: muted }));
    y -= Math.max(1, lines.length) * 12 + 2;
  }
  y -= 18;

  // Remarks
  if (card.remarks.length) {
    ensure(40);
    text('Remarks', M, 12, bold);
    y -= 18;
    for (const r of card.remarks.slice(0, 8)) {
      const lines = wrap(`"${r.text}"`, font, 10, W);
      ensure(lines.length * 13 + 18);
      lines.forEach((l) => {
        page.drawText(l, { x: M, y, size: 10, font, color: ink });
        y -= 13;
      });
      text(`- ${r.author}${r.subject ? `, ${r.subject}` : ''}`, M, 8, font, muted);
      y -= 16;
    }
  }

  // Signatures + footer on the last page
  ensure(80);
  y = Math.min(y - 30, M + 70);
  for (const [i, label] of ['Class Incharge', 'Principal', 'Parent / Guardian'].entries()) {
    const x = M + i * (W / 3);
    page.drawLine({ start: { x, y }, end: { x: x + W / 3 - 20, y }, thickness: 0.75, color: muted });
    page.drawText(label, { x, y: y - 12, size: 8, font, color: muted });
  }
  for (const [i, p] of pdf.getPages().entries()) {
    p.drawText(
      latin(
        `Generated ${card.generatedOn} by EDUsaas · Only published marks are shown · Page ${i + 1} of ${pdf.getPageCount()}`,
      ),
      {
        x: M,
        y: 24,
        size: 7,
        font,
        color: muted,
      },
    );
  }
  return pdf.save();
}

export async function reportCardPdf(ctx: AuthedContext, studentId: string) {
  const card = await collect(ctx, studentId);
  const bytes = await renderReportCard(card);
  const name = `report-card-${card.section}-${card.rollNumber ?? ''}-${card.name}`
    .replace(/[^\w.-]+/g, '-')
    .slice(0, 80);
  return new Response(new Uint8Array(bytes), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="${name}.pdf"`,
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}

export async function myReportCard(ctx: AuthedContext) {
  const me = await inTenant(ctx, (tx) =>
    tx.student.findUnique({ where: { userId: ctx.user.id }, select: { id: true } }),
  );
  if (!me) throw notFound('Student record');
  return reportCardPdf(ctx, me.id);
}
