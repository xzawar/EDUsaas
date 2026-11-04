/**
 * Username scheme (spec §3.2, decision D2).
 *   Student: {prefix}-{class}{section}-{firstname}-{roll}   e.g. bss-9a-ahmad-14
 *   Teacher: {prefix}-t-{name}-{n}                           e.g. bss-t-alikhan-3
 * Login is case- and separator-insensitive via the stored normalized form.
 */

/** Lowercase and strip everything except a-z/0-9: "BSS-8A-Ahmad-14" → "bss8aahmad14". */
export function normalizeUsername(value: string): string {
  return value
    .normalize('NFKD')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
    .slice(0, 120);
}

/** A single username segment: lowercase alphanumerics only. */
export function segment(value: string, max = 20): string {
  return value
    .normalize('NFKD')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
    .slice(0, max);
}

function firstName(displayName: string): string {
  const first = displayName.trim().split(/\s+/)[0] ?? '';
  return segment(first) || 'student';
}

export function studentUsername(input: {
  prefix: string;
  className: string;
  sectionName: string;
  displayName: string;
  rollNumber: number;
}): string {
  if (!Number.isInteger(input.rollNumber) || input.rollNumber < 1)
    throw new Error('Roll number must be a positive integer');
  const cls = segment(input.className.replace(/^(grade|class)\s*/i, ''), 10) + segment(input.sectionName, 5);
  return `${segment(input.prefix, 10)}-${cls}-${firstName(input.displayName)}-${input.rollNumber}`;
}

export function teacherUsername(input: { prefix: string; displayName: string; sequence: number }): string {
  const name = segment(input.displayName.replace(/\s+/g, ''), 20) || 'teacher';
  return `${segment(input.prefix, 10)}-t-${name}-${input.sequence}`;
}

/** Tenant prefix rules: 2–10 lowercase letters/digits, unique platform-wide (DB enforces uniqueness). */
export const PREFIX_PATTERN = /^[a-z0-9]{2,10}$/;
