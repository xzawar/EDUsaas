import type { Metadata, Viewport } from 'next';
import { headers } from 'next/headers';
import { Plus_Jakarta_Sans } from 'next/font/google';
import './globals.css';

const sans = Plus_Jakarta_Sans({ subsets: ['latin'], variable: '--font-jakarta', display: 'swap' });

export const metadata: Metadata = {
  title: { default: 'EDUsaas', template: '%s · EDUsaas' },
  description: 'School management for administrators, teachers and students.',
};

export const viewport: Viewport = { width: 'device-width', initialScale: 1, themeColor: '#0f172a' };

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Reading headers makes every page dynamic, which the nonce-based CSP requires.
  await headers();
  return (
    <html lang="en" className={sans.variable}>
      <body className="min-h-screen">{children}</body>
    </html>
  );
}
