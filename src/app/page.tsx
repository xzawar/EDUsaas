import Link from 'next/link';
import { BrandMark } from '@/components/AuthLayout';
import { buttonClass } from '@/components/ui';

/** Landing: who are you? One loud choice (most people are students and parents), one quiet one for staff. */
export default function Home() {
  return (
    <main className="flex min-h-screen flex-col bg-white">
      <header className="mx-auto flex w-full max-w-5xl items-center justify-between px-4 py-5 sm:px-8">
        <span className="inline-flex items-center gap-2.5 text-lg font-semibold text-primary">
          <BrandMark /> EDUsaas
        </span>
        <Link href="/download" className="text-sm font-semibold text-link underline underline-offset-4">
          Get the Android app
        </Link>
      </header>
      <section className="mx-2 mb-2 flex flex-1 flex-col justify-center rounded-3xl bg-deep px-6 py-16 sm:px-12">
        <div className="mx-auto w-full max-w-4xl">
          <h1 className="font-display text-[52px] leading-[0.85] tracking-[-0.01em] text-accent sm:text-[80px]">
            School,
            <br />
            made simple.
          </h1>
          <p className="mt-8 max-w-xl text-lg leading-7 text-white/80">
            Attendance, marks, fees and the timetable for students, parents, teachers and the school office.
          </p>
          <div className="mt-10 flex flex-wrap gap-3">
            <Link href="/login" className={buttonClass('primary', 'lg')}>
              Student or parent sign in
            </Link>
            <Link
              href="/staff/login"
              className={`${buttonClass('secondary', 'lg')} bg-white/10 text-white hover:bg-white/20`}
            >
              Staff sign in
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}
