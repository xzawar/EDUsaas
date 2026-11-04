import 'server-only';
import crypto from 'node:crypto';
import { hash, verify } from '@node-rs/argon2';
import { z } from 'zod';

// Argon2id (algorithm 2), OWASP-recommended parameters: m=19 MiB, t=2, p=1.
const ARGON2 = { algorithm: 2, memoryCost: 19456, timeCost: 2, parallelism: 1 } as const;

export function hashPassword(plain: string): Promise<string> {
  return hash(plain, ARGON2);
}

export async function verifyPassword(stored: string, plain: string): Promise<boolean> {
  try {
    return await verify(stored, plain);
  } catch {
    return false;
  }
}

// Used when the account doesn't exist, so response time doesn't reveal whether a username is real.
let dummyHash: Promise<string> | undefined;
export async function burnPasswordCheck(plain: string): Promise<void> {
  dummyHash ??= hashPassword(crypto.randomBytes(16).toString('hex'));
  await verifyPassword(await dummyHash, plain);
}

export const newPasswordSchema = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .max(128, 'Password must be at most 128 characters')
  .refine((p) => /[a-zA-Z]/.test(p) && /[0-9]/.test(p), 'Password must contain letters and numbers');

/** Temporary credential for admin-issued accounts (forced change on first login). No ambiguous characters. */
export function generateTemporaryPassword(): string {
  const alphabet = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  for (;;) {
    let out = '';
    for (let i = 0; i < 12; i++) out += alphabet[crypto.randomInt(alphabet.length)];
    const candidate = `${out.slice(0, 4)}-${out.slice(4, 8)}-${out.slice(8)}`;
    if (newPasswordSchema.safeParse(candidate).success) return candidate;
  }
}

export function randomToken(): string {
  return crypto.randomBytes(32).toString('base64url');
}

export function sha256(value: string): string {
  return crypto.createHash('sha256').update(value).digest('hex');
}
