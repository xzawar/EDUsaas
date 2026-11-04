import {NextResponse} from 'next/server';import {destroySession,getCurrentUser} from '@/lib/auth';import {audit} from '@/lib/audit';
export async function POST(req:Request){const u=await getCurrentUser();if(u)await audit({tenantId:u.tenantId,actorId:u.id,action:'LOGOUT',entity:'User',entityId:u.id,request:req});await destroySession();return NextResponse.json({ok:true})}
