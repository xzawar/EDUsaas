import { beforeAll, describe, expect, it } from 'vitest';
import { Client } from 'pg';
import { withTenant } from '@/server/db/client';
import { seedFixtures, type Fixtures } from './helpers/fixtures';

/**
 * Database-level tenant isolation (spec §8, §9.2): these hold even if application code forgets a filter.
 */
let f: Fixtures;
beforeAll(async () => {
  f = await seedFixtures();
});

async function asRole(url: string, fn: (c: Client) => Promise<void>) {
  const c = new Client({ connectionString: url });
  await c.connect();
  try {
    await fn(c);
  } finally {
    await c.end();
  }
}

describe('RLS with the app role (edusaas_app)', () => {
  it('sees nothing when no tenant is set (fail closed)', async () => {
    await asRole(process.env.DATABASE_URL!, async (c) => {
      for (const t of ['users', 'tenants', 'tenant_settings', 'audit_logs']) {
        const r = await c.query(`SELECT count(*)::int AS n FROM ${t}`);
        expect(r.rows[0].n, t).toBe(0);
      }
    });
  });

  it('withTenant() sees only its own tenant', async () => {
    const users = await withTenant({ tenantId: f.tenantA.id }, (tx) =>
      tx.user.findMany({ select: { tenantId: true } }),
    );
    expect(users.length).toBe(6);
    expect(new Set(users.map((u) => u.tenantId))).toEqual(new Set([f.tenantA.id]));
    const tenants = await withTenant({ tenantId: f.tenantA.id }, (tx) => tx.tenant.findMany());
    expect(tenants.map((t) => t.id)).toEqual([f.tenantA.id]);
  });

  it('cannot read another tenant row by id', async () => {
    const other = await withTenant({ tenantId: f.tenantA.id }, (tx) =>
      tx.user.findUnique({ where: { id: f.b.STUDENT.id } }),
    );
    expect(other).toBeNull();
  });

  it('cannot write a row into another tenant', async () => {
    await expect(
      withTenant({ tenantId: f.tenantA.id }, (tx) =>
        tx.user.create({
          data: {
            tenantId: f.tenantB.id,
            role: 'TEACHER',
            displayName: 'x',
            usernameNormalized: 'scbtx1',
            passwordHash: 'x',
          },
        }),
      ),
    ).rejects.toThrow(/row-level security/i);
  });

  it('cannot move a row to another tenant', async () => {
    const r = await withTenant({ tenantId: f.tenantA.id }, async (tx) => {
      try {
        await tx.user.update({ where: { id: f.a.TEACHER.id }, data: { tenantId: f.tenantB.id } });
        return 'updated';
      } catch (e) {
        return (e as Error).message;
      }
    });
    expect(r).toMatch(/row-level security/i);
  });

  it('cannot update or delete another tenant rows (silently affects 0 rows)', async () => {
    const n = await withTenant({ tenantId: f.tenantA.id }, (tx) =>
      tx.user.updateMany({ where: { id: f.b.SCHOOL_ADMIN.id }, data: { displayName: 'hacked' } }),
    );
    expect(n.count).toBe(0);
  });

  it('has no access to sessions or reset tokens at all', async () => {
    await asRole(process.env.DATABASE_URL!, async (c) => {
      await expect(c.query('SELECT 1 FROM sessions')).rejects.toThrow(/permission denied/);
      await expect(c.query('SELECT 1 FROM password_reset_tokens')).rejects.toThrow(/permission denied/);
    });
  });

  it('cannot create tenants or change their status', async () => {
    await asRole(process.env.DATABASE_URL!, async (c) => {
      await expect(
        c.query("INSERT INTO tenants (id, name, prefix, updated_at) VALUES (gen_random_uuid(), 'x', 'xx', now())"),
      ).rejects.toThrow(/permission denied/);
      await expect(c.query("UPDATE tenants SET status = 'ACTIVE'")).rejects.toThrow(/permission denied/);
    });
  });

  it('cannot disable RLS (not the table owner)', async () => {
    await asRole(process.env.DATABASE_URL!, async (c) => {
      await expect(c.query('ALTER TABLE users DISABLE ROW LEVEL SECURITY')).rejects.toThrow(/must be owner/);
    });
  });

  it('can only insert audit rows for its own tenant', async () => {
    await withTenant({ tenantId: f.tenantA.id }, (tx) =>
      tx.auditLog.create({ data: { tenantId: f.tenantA.id, action: 't', entity: 'T' } }),
    );
    await expect(
      withTenant({ tenantId: f.tenantA.id }, (tx) =>
        tx.auditLog.create({ data: { tenantId: f.tenantB.id, action: 't', entity: 'T' } }),
      ),
    ).rejects.toThrow(/row-level security/i);
  });
});

describe('audit log is insert-only (spec §9.7)', () => {
  for (const [name, url] of [
    ['edusaas_app', () => process.env.DATABASE_URL!],
    ['edusaas_system', () => process.env.SYSTEM_DATABASE_URL!],
  ] as const) {
    it(`${name} cannot UPDATE, DELETE or TRUNCATE audit_logs`, async () => {
      await asRole(url(), async (c) => {
        await expect(c.query("UPDATE audit_logs SET action = 'x'")).rejects.toThrow(/permission denied/);
        await expect(c.query('DELETE FROM audit_logs')).rejects.toThrow(/permission denied/);
        await expect(c.query('TRUNCATE audit_logs')).rejects.toThrow(/permission denied/);
      });
    });
  }
});

describe('integrity constraints', () => {
  it('allows only one School Admin per school', async () => {
    await expect(
      withTenant({ tenantId: f.tenantA.id }, (tx) =>
        tx.user.create({
          data: {
            tenantId: f.tenantA.id,
            role: 'SCHOOL_ADMIN',
            displayName: 'Second',
            email: 'second@a.test',
            passwordHash: 'x',
          },
        }),
      ),
    ).rejects.toThrow(/users_one_school_admin_per_tenant|Unique constraint/);
  });

  it('school users must have a tenant; platform users must not', async () => {
    await asRole(process.env.SYSTEM_DATABASE_URL!, async (c) => {
      await expect(
        c.query(
          "INSERT INTO users (id, role, display_name, email, password_hash, updated_at) VALUES (gen_random_uuid(), 'TEACHER', 'x', 'x@x.test', 'x', now())",
        ),
      ).rejects.toThrow(/users_tenant_matches_role/);
    });
  });
});

describe('finance tables (spec §2.2): tenant-owned, money rows immutable', () => {
  it('a fee head cannot be written into another school, and the ledger is append-only', async () => {
    await expect(
      withTenant({ tenantId: f.tenantA.id }, (tx) =>
        tx.feeHead.create({ data: { tenantId: f.tenantB.id, name: 'Tuition', kind: 'MONTHLY' } }),
      ),
    ).rejects.toThrow();
    const entry = await withTenant({ tenantId: f.tenantA.id }, (tx) =>
      tx.ledgerEntry.create({
        data: {
          tenantId: f.tenantA.id,
          entryOn: new Date('2026-11-01'),
          kind: 'FEE',
          direction: 'IN',
          amountPaisa: 100n,
          refTable: 'payments',
          refId: f.a.STUDENT.id,
        },
      }),
    );
    await expect(
      withTenant({ tenantId: f.tenantA.id }, (tx) =>
        tx.ledgerEntry.update({ where: { id: entry.id }, data: { amountPaisa: 200n } }),
      ),
    ).rejects.toThrow(/append-only|denied/);
    await expect(
      withTenant({ tenantId: f.tenantA.id }, (tx) => tx.ledgerEntry.delete({ where: { id: entry.id } })),
    ).rejects.toThrow(/append-only|denied/);
    // School B never sees it.
    const seen = await withTenant({ tenantId: f.tenantB.id }, (tx) => tx.ledgerEntry.count());
    expect(seen).toBe(0);
  });

  it('a payment cannot reference another school’s invoice', async () => {
    const yearA = await withTenant({ tenantId: f.tenantA.id }, (tx) =>
      tx.academicYear.findFirstOrThrow({ where: { status: 'CURRENT' } }),
    );
    const inv = await withTenant({ tenantId: f.tenantA.id }, (tx) =>
      tx.invoice.create({
        data: {
          tenantId: f.tenantA.id,
          studentId: f.s.studentA,
          academicYearId: yearA.id,
          period: '2026-11',
          number: 'I-000001',
          issuedOn: new Date('2026-11-01'),
          dueOn: new Date('2026-11-10'),
          subtotalPaisa: 1000n,
        },
      }),
    );
    await expect(
      withTenant({ tenantId: f.tenantB.id }, (tx) =>
        tx.payment.create({
          data: {
            tenantId: f.tenantB.id,
            studentId: f.s.studentB,
            invoiceId: inv.id,
            amountPaisa: 1000n,
            method: 'CASH',
            receivedOn: new Date('2026-11-02'),
            receivedBy: f.b.SCHOOL_ADMIN.id,
            receiptNumber: 'R-000001',
          },
        }),
      ),
    ).rejects.toThrow();
  });
});
