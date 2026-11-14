import type { Metadata } from 'next';
import Link from 'next/link';
import { buttonClass } from '@/components/ui';
import { MOBILE_RELEASE } from '@/server/mobile/release';

export const metadata: Metadata = { title: 'Get the Android app · EDUsaas' };

const STEPS = [
  'Tap “Download for Android” on your phone.',
  'Open the downloaded file. If Android asks, allow your browser to install apps.',
  'Open EDUsaas, choose Student, Staff or Platform, and sign in with your usual account.',
];

/** Direct APK download (Finance & Android spec §3.3). The file itself lives wherever the release workflow put it. */
export default function DownloadPage() {
  const r = MOBILE_RELEASE;
  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col justify-center px-4 py-16">
      <p className="text-sm font-semibold text-slate-500">EDUsaas</p>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight">Get the Android app</h1>
      <p className="mt-3 text-slate-600">
        Registers, marks, fees and receipts in your pocket. It keeps working without internet and sends your work when
        you’re back online.
      </p>
      <div className="mt-8 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        {r.apkUrl ? (
          <>
            <a href={r.apkUrl} className={`${buttonClass('primary', 'lg')} w-full sm:w-auto`}>
              Download for Android
            </a>
            <p className="mt-3 text-sm text-slate-500">
              Version {r.version}
              {r.releasedOn ? ` · released ${r.releasedOn}` : ''} · Android 7 or newer
            </p>
            {r.notes && <p className="mt-3 text-sm text-slate-700">{r.notes}</p>}
          </>
        ) : (
          <>
            <p className="font-semibold text-slate-900">The app isn’t published yet.</p>
            <p className="mt-1 text-sm text-slate-600">
              Your school will share the download link here. Until then everything works in the browser.
            </p>
          </>
        )}
      </div>
      <ol className="mt-8 space-y-3">
        {STEPS.map((s, i) => (
          <li key={s} className="flex gap-3 text-slate-700">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-slate-100 text-sm font-semibold">
              {i + 1}
            </span>
            <span className="pt-0.5">{s}</span>
          </li>
        ))}
      </ol>
      <p className="mt-10 text-sm text-slate-500">
        Prefer the browser?{' '}
        <Link href="/" className="font-medium text-slate-900 underline">
          Sign in on the web
        </Link>
        .
      </p>
    </main>
  );
}
