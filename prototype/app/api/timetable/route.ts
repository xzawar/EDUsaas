import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentUser } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { audit } from '@/lib/audit';
const schema = z.object({ sectionId:z.string(), subjectId:z.string(), teacherId:z.string(), dayOfWeek:z.number().int().min(0).max(6), startsAt:z.string().regex(/^\d{2}:\d{2}$/), endsAt:z.string().regex(/^\d{2}:\d{2}$/), room:z.string().max(50).optional() });
function overlap(aStart:string,aEnd:string,bStart:string,bEnd:string){ return aStart < bEnd && bStart < aEnd; }
export async function POST(req:Request){
  const u=await getCurrentUser();
  if(!u?.tenantId||!['SCHOOL_ADMIN','PRINCIPAL'].includes(u.role)) return NextResponse.json({error:{message:'Forbidden'}},{status:403});
  if(u.role==='PRINCIPAL'&&!u.tenant?.settings?.principalCanTimetable) return NextResponse.json({error:{message:'Permission disabled'}},{status:403});
  try{
    const b=schema.parse(await req.json());
    if(b.startsAt>=b.endsAt) return NextResponse.json({error:{message:'Start time must be before end time'}},{status:400});
    const conflicts=await prisma.timetableSlot.findMany({where:{tenantId:u.tenantId,dayOfWeek:b.dayOfWeek,OR:[{sectionId:b.sectionId},{teacherId:b.teacherId}]}});
    if(conflicts.some(x=>overlap(b.startsAt,b.endsAt,x.startsAt,x.endsAt))) return NextResponse.json({error:{message:'Timetable conflict for this section or teacher'}},{status:409});
    const x=await prisma.timetableSlot.create({data:{tenantId:u.tenantId!,sectionId:b.sectionId,subjectId:b.subjectId,teacherId:b.teacherId,dayOfWeek:b.dayOfWeek,startsAt:b.startsAt,endsAt:b.endsAt,room:b.room||null}});
    await audit({tenantId:u.tenantId,actorId:u.id,action:'CREATE',entity:'TimetableSlot',entityId:x.id,request:req});
    const full=await prisma.timetableSlot.findUnique({where:{id:x.id},include:{section:{include:{class:true}},subject:true,teacher:{include:{user:true}}}});
    return NextResponse.json({slot:{id:full!.id,day:['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][full!.dayOfWeek],startsAt:full!.startsAt,endsAt:full!.endsAt,section:`${full!.section.class.name}-${full!.section.name}`,subject:full!.subject.name,teacher:full!.teacher?.user.displayName||'-',room:full!.room}},{status:201});
  }catch(e:any){return NextResponse.json({error:{message:e?.message||'Failed'}},{status:400})}
}
