import type { Metadata, Viewport } from 'next';
import { headers } from 'next/headers';
import { Archivo_Black, Inter } from 'next/font/google';
import './globals.css';

const sans = Inter({ subsets: ['latin'], variable: '--font-inter', display: 'swap' });
// Heavy display face for the few hero moments (sign-in, big numbers, results). A free stand-in for a brand display font.
const display = Archivo_Black({ subsets: ['latin'], weight: '400', variable: '--font-archivo', display: 'swap' });

export const metadata: Metadata = {
  title: { default: 'EDUsaas', template: '%s · EDUsaas' },
  description: 'School management for administrators, teachers and students.',
};

export const viewport: Viewport = { width: 'device-width', initialScale: 1, themeColor: '#ffffff' };

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Reading headers makes every page dynamic, which the nonce-based CSP requires.
  await headers();
  return (
    <html lang="en" className={`${sans.variable} ${display.variable}`}>
      <body className="min-h-screen">{children}</body>
    </html>
  );
}
