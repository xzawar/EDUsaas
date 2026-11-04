import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { FlatCompat } from '@eslint/eslintrc';

const compat = new FlatCompat({ baseDirectory: dirname(fileURLToPath(import.meta.url)) });

const config = [
  {
    ignores: [
      'prototype/**',
      '.next/**',
      'node_modules/**',
      'playwright-report/**',
      'test-results/**',
      'next-env.d.ts',
    ],
  },
  ...compat.extends('next/core-web-vitals', 'next/typescript'),
  {
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      // The privileged (RLS-bypassing) client may only be imported by modules that need cross-tenant access.
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: '@/server/db/system',
              message:
                'systemDb bypasses RLS. Only server/auth, server/platform, server/audit and server/jobs may import it.',
            },
          ],
        },
      ],
    },
  },
  {
    files: [
      'src/server/auth/**',
      'src/server/platform/**',
      'src/server/audit/**',
      'src/server/jobs/**',
      'src/server/db/**',
      'tests/**',
      'scripts/**',
      'prisma/**',
    ],
    rules: { 'no-restricted-imports': 'off' },
  },
];
export default config;
