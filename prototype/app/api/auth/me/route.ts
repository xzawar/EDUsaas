import {NextResponse} from 'next/server';import {getCurrentUser} from '@/lib/auth';
export async function GET(){const u=await getCurrentUser();if(!u)return NextResponse.json({user:null},{status:401});return NextResponse.json({user:{id:u.id,displayName:u.displayName,username:u.username,role:u.role,tenant:u.tenant?.name}})}
