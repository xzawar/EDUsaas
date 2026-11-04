import type { MetadataRoute } from 'next';

/** Installable app (spec §1.4: the teacher attendance flow is an installable PWA). */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'EDUsaas',
    short_name: 'EDUsaas',
    description: 'School management for teachers, students and school staff.',
    start_url: '/staff',
    display: 'standalone',
    background_color: '#f8fafc',
    theme_color: '#0f766e',
    icons: [{ src: '/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' }],
  };
}
