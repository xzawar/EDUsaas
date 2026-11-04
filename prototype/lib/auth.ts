import { cookies } from 'next/headers';
import crypto from 'node:crypto';
import { prisma } from '@/lib/prisma';
import { normalizeUsername, hashToken } from '@/lib/security';
import type { UserRole } from '@prisma/client';
const COOKIE=process.env.SESSION_COOKIE_NAME||'edu_session';
const TTL_DAYS=Number(process.env.SESSION_TTL_DAYS||60);
export async function createSession(userId:string, meta?:{ipAddress?:string;userAgent?:string}){
  const raw=crypto.randomBytes(32).toString('base64url');
  await prisma.session.create({data:{tokenHash:hashToken(raw),userId,expiresAt:new Date(Date.now()+TTL_DAYS*86400000),ipAddress:meta?.ipAddress,userAgent:meta?.userAgent}});
  const jar=await cookies(); jar.set(COOKIE,raw,{httpOnly:true,secure:process.env.NODE_ENV==='production',sameSite:'lax',path:'/',maxAge:TTL_DAYS*86400});
}
export async function destroySession(){ const jar=await cookies(); const raw=jar.get(COOKIE)?.value; if(raw) await prisma.session.deleteMany({where:{tokenHash:hashToken(raw)}}); jar.set(COOKIE,'',{httpOnly:true,secure:process.env.NODE_ENV==='production',sameSite:'lax',path:'/',maxAge:0}); }
export async function getCurrentUser(){
  const jar=await cookies(); const raw=jar.get(COOKIE)?.value; if(!raw) return null;
  const session=await prisma.session.findUnique({where:{tokenHash:hashToken(raw)},include:{user:{include:{tenant:{include:{settings:true}},student:{include:{currentSection:{include:{class:true}}}},teacher:true}}}});
  if(!session || session.expiresAt<new Date() || session.user.status!=='ACTIVE'){ return null; }
  await prisma.session.update({where:{id:session.id},data:{lastSeenAt:new Date()}});
  return session.user;
}
export function hasRole(user:any, roles:UserRole[]){ return roles.includes(user.role as UserRole); }
export async function requireUser(roles?:UserRole[]){ const user=await getCurrentUser(); if(!user) throw new Error('UNAUTHENTICATED'); if(roles && !roles.includes(user.role)) throw new Error('FORBIDDEN'); return user; }
export async function findLoginUser(input:string){
  const raw=input.trim(); const norm=normalizeUsername(raw);
  return prisma.user.findFirst({where:{OR:[{usernameNormalized:norm},{email:{equals:raw,mode:'insensitive'}}]}});
}
