import { afterAll } from 'vitest';
import { testEnv } from './test-env';

Object.assign(process.env, testEnv());

afterAll(async () => {
  const { disconnectAppDb } = await import('@/server/db/client');
  const { disconnectSystemDb } = await import('@/server/db/system');
  await Promise.all([disconnectAppDb(), disconnectSystemDb()]);
});
