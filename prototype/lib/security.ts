import crypto from 'node:crypto';
export function normalizeUsername(value:string){ return value.trim().toLowerCase().replace(/[^a-z0-9]/g,'').slice(0,120); }
export function usernamePart(value:string){ return value.trim().toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'').slice(0,60); }
export function hashToken(token:string){ return crypto.createHash('sha256').update(token).digest('hex'); }
export function clientFingerprint(req:Request){ const ua=req.headers.get('user-agent')||''; const ip=req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()||''; return crypto.createHash('sha256').update(`${ua}|${ip}`).digest('hex').slice(0,32); }
export const ALLOWED_IMAGE_TYPES=['image/jpeg','image/png','image/webp'];
export function safeFileName(name:string){ return name.replace(/[^a-zA-Z0-9._-]/g,'_').slice(0,100); }
