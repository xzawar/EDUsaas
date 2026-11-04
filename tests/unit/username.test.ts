import { describe, expect, it } from 'vitest';
import { PREFIX_PATTERN, normalizeUsername, studentUsername, teacherUsername } from '@/server/auth/username';

describe('normalizeUsername (spec §3.2: case- and separator-insensitive)', () => {
  it.each(['BSS-8A-Ahmad-14', 'bss-8a-ahmad-14', 'bss8aahmad14', ' BSS_8A ahmad.14 '])('%s → bss8aahmad14', (v) => {
    expect(normalizeUsername(v)).toBe('bss8aahmad14');
  });
  it('strips accents and caps length', () => {
    expect(normalizeUsername('Zoë-Ü')).toBe('zoeu');
    expect(normalizeUsername('a'.repeat(500))).toHaveLength(120);
  });
});

describe('studentUsername', () => {
  it('builds prefix-classsection-firstname-roll', () => {
    expect(
      studentUsername({
        prefix: 'BSS',
        className: '9',
        sectionName: 'A',
        displayName: 'Ahmad Raza Khan',
        rollNumber: 14,
      }),
    ).toBe('bss-9a-ahmad-14');
  });
  it('drops a "Grade"/"Class" prefix from the class name', () => {
    expect(
      studentUsername({
        prefix: 'bss',
        className: 'Grade 10',
        sectionName: 'Blue',
        displayName: 'Sara',
        rollNumber: 2,
      }),
    ).toBe('bss-10blue-sara-2');
  });
  it('same name, different roll number → different usernames', () => {
    const base = { prefix: 'bss', className: '8', sectionName: 'A', displayName: 'Ahmad Khan' };
    expect(studentUsername({ ...base, rollNumber: 3 })).not.toBe(studentUsername({ ...base, rollNumber: 4 }));
  });
  it('rejects invalid roll numbers', () => {
    expect(() =>
      studentUsername({ prefix: 'bss', className: '8', sectionName: 'A', displayName: 'X', rollNumber: 0 }),
    ).toThrow();
  });
});

describe('teacherUsername (decision D2)', () => {
  it('builds prefix-t-name-n', () => {
    expect(teacherUsername({ prefix: 'bss', displayName: 'Ali Khan', sequence: 3 })).toBe('bss-t-alikhan-3');
  });
});

describe('tenant prefix', () => {
  it.each(['bss', 'ab', 'school1234'])('accepts %s', (p) => expect(PREFIX_PATTERN.test(p)).toBe(true));
  it.each(['a', 'BSS', 'b s', 'b-s', 'abcdefghijk'])('rejects %s', (p) => expect(PREFIX_PATTERN.test(p)).toBe(false));
});
