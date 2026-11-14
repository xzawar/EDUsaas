import { describe, expect, it } from 'vitest';
import { ALL_PERMISSIONS, ROLE_POLICIES, effectivePermissions, isConfigurable } from '@/server/authz/permissions';

describe('role policies (spec §2)', () => {
  it('Platform Owner has no tenant-data permissions (break-glass only)', () => {
    const perms = effectivePermissions('PLATFORM_OWNER');
    for (const p of perms) expect(p.startsWith('platform.')).toBe(true);
  });

  it('Platform Admin has only health by default', () => {
    expect([...effectivePermissions('PLATFORM_ADMIN')]).toEqual(['platform.health.read']);
  });

  it('School Admin has every school permission and no platform permission', () => {
    const perms = effectivePermissions('SCHOOL_ADMIN');
    expect(perms.has('settings.manage')).toBe(true);
    expect(perms.has('promotion.run')).toBe(true);
    expect([...perms].some((p) => p.startsWith('platform.'))).toBe(false);
  });

  it('Principal always has student search, even with every toggle off', () => {
    const allOff = Object.fromEntries(Object.keys(ROLE_POLICIES.PRINCIPAL.configurable).map((k) => [k, false]));
    const perms = effectivePermissions('PRINCIPAL', allOff);
    expect(perms.has('students.search')).toBe(true);
    expect(perms.has('reports.read')).toBe(false);
  });

  it('school toggles override Principal defaults both ways', () => {
    expect(effectivePermissions('PRINCIPAL').has('promotion.run')).toBe(false);
    expect(effectivePermissions('PRINCIPAL', { 'promotion.run': true }).has('promotion.run')).toBe(true);
    expect(effectivePermissions('PRINCIPAL', { 'audit.read': false }).has('audit.read')).toBe(false);
  });

  it('Accountant gets finance plus student lookup only', () => {
    const p = effectivePermissions('ACCOUNTANT');
    expect([...p].sort()).toEqual([
      'expenses.manage',
      'fees.collect',
      'fees.manage',
      'finance.read',
      'payroll.manage',
      'students.read',
      'students.search',
    ]);
  });

  it('Principal finance.read is a toggle, default on; Student has self.fees; Teacher has no finance', () => {
    expect(effectivePermissions('PRINCIPAL').has('finance.read')).toBe(true);
    expect(effectivePermissions('PRINCIPAL', { 'finance.read': false }).has('finance.read')).toBe(false);
    expect(effectivePermissions('STUDENT').has('self.fees')).toBe(true);
    expect(effectivePermissions('SCHOOL_ADMIN').has('self.fees')).toBe(false);
    expect(effectivePermissions('TEACHER').has('finance.read')).toBe(false);
  });

  it('Teacher and Student access is fixed (not configurable)', () => {
    expect(Object.keys(ROLE_POLICIES.TEACHER.configurable)).toHaveLength(0);
    expect(Object.keys(ROLE_POLICIES.STUDENT.configurable)).toHaveLength(0);
    // An override for a non-configurable permission is ignored.
    expect(effectivePermissions('TEACHER', { 'settings.manage': true }).has('settings.manage')).toBe(false);
  });

  it('only declared permissions are configurable', () => {
    expect(isConfigurable('PRINCIPAL', 'promotion.run')).toBe(true);
    expect(isConfigurable('PRINCIPAL', 'settings.manage')).toBe(false);
    expect(isConfigurable('TEACHER', 'attendance.submit')).toBe(false);
    expect(isConfigurable('PRINCIPAL', '__proto__')).toBe(false);
  });

  it('every permission referenced by a policy exists in the catalog', () => {
    for (const policy of Object.values(ROLE_POLICIES)) {
      for (const p of [...policy.fixed, ...Object.keys(policy.configurable)]) expect(ALL_PERMISSIONS).toContain(p);
    }
  });
});
