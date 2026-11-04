import { NextResponse } from 'next/server';
export function ok(data:any,status=200){ return NextResponse.json(data,{status}); }
export function fail(message:string,status=400,code='BAD_REQUEST'){ return NextResponse.json({error:{code,message}},{status}); }
