import type { Metadata } from 'next';
import { PageHeader } from '@/components/AppShell';
import { CategoriesEditor, ExpenseTable, NewExpenseButton } from '@/components/finance/ExpensesPanel';
import { Money } from '@/components/finance/shared';
import { Card, EmptyState, Select } from '@/components/ui';
import { requirePortal } from '@/server/auth/page';
import { inTenant, schoolClock } from '@/server/school/common';
import { listCategories, listExpenses, listExpensesQuery } from '@/server/school/finance/expenses';
import { ShoppingBag } from 'lucide-react';

export const metadata: Metadata = { title: 'Expenses' };

export default async function ExpensesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const ctx = await requirePortal('STAFF');
  if (!ctx.can('expenses.manage') && !ctx.can('finance.read')) {
    const { redirect } = await import('next/navigation');
    redirect('/staff');
  }
  const sp = await searchParams;
  const parsed = listExpensesQuery.safeParse(sp);
  const q = parsed.success ? parsed.data : listExpensesQuery.parse({});
  const [clock, list, categories] = await Promise.all([
    inTenant(ctx, (tx) => schoolClock(tx)),
    listExpenses(ctx, q),
    listCategories(ctx, true),
  ]);
  const canWrite = ctx.can('expenses.manage');
  return (
    <>
      <PageHeader
        title="Expenses"
        description="Every rupee the school spends, with a voucher number. Salaries are added here by payroll."
        actions={
          canWrite ? (
            <NewExpenseButton categories={JSON.parse(JSON.stringify(categories))} today={clock.today} />
          ) : undefined
        }
      />
      <div className="space-y-6">
        <Card>
          <form className="mb-4 flex flex-wrap items-end gap-3" action="/staff/finance/expenses">
            <label className="text-sm">
              <span className="mb-1 block text-xs font-medium text-slate-600">From</span>
              <input
                type="date"
                name="from"
                defaultValue={list.from}
                className="h-9 rounded-lg border border-slate-300 px-2 text-sm"
              />
            </label>
            <label className="text-sm">
              <span className="mb-1 block text-xs font-medium text-slate-600">To</span>
              <input
                type="date"
                name="to"
                defaultValue={list.to}
                className="h-9 rounded-lg border border-slate-300 px-2 text-sm"
              />
            </label>
            <label className="text-sm">
              <span className="mb-1 block text-xs font-medium text-slate-600">Category</span>
              <Select name="categoryId" defaultValue={q.categoryId ?? ''} className="h-9">
                <option value="">All</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
            </label>
            <button
              type="submit"
              className="inline-flex h-10 items-center justify-center rounded-full bg-white px-5 text-[15px] font-semibold text-primary ring-1 ring-line hover:bg-tint-strong"
            >
              Show
            </button>
            <span className="ml-auto text-sm text-slate-600">
              Total: <Money paisa={list.totalPaisa} className="font-semibold text-slate-900" />
            </span>
          </form>
          {list.items.length === 0 && categories.length === 0 ? (
            <EmptyState
              icon={<ShoppingBag className="size-5" />}
              title="No expenses yet"
              description="Add a category below (Utilities, Repairs, Stationery…), then record the first expense."
            />
          ) : (
            <ExpenseTable items={JSON.parse(JSON.stringify(list.items))} />
          )}
        </Card>
        {canWrite && (
          <Card title="Categories" description="Keep them few and clear; reports group spending by category.">
            <CategoriesEditor categories={JSON.parse(JSON.stringify(categories))} />
          </Card>
        )}
      </div>
    </>
  );
}
