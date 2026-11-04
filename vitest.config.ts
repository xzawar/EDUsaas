import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';
import tsconfigPaths from 'vite-tsconfig-paths';

// `server-only` throws outside a React Server Component bundle; in tests it is a no-op.
const alias = { 'server-only': fileURLToPath(new URL('./tests/stubs/server-only.ts', import.meta.url)) };

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    // Integration tests share one database; run files serially.
    fileParallelism: false,
    projects: [
      {
        plugins: [tsconfigPaths()],
        resolve: { alias },
        test: { name: 'unit', include: ['tests/unit/**/*.test.ts'], environment: 'node' },
      },
      {
        plugins: [tsconfigPaths()],
        resolve: { alias },
        test: {
          name: 'integration',
          include: ['tests/integration/**/*.test.ts'],
          environment: 'node',
          globalSetup: ['tests/integration/global-setup.ts'],
          setupFiles: ['tests/integration/setup.ts'],
          testTimeout: 30000,
          hookTimeout: 120000,
        },
      },
    ],
  },
});
