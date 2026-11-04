import {PrismaClient,UserRole,UserStatus,TenantStatus,AttendanceStatus} from '@prisma/client';import bcrypt from 'bcryptjs';
const prisma=new PrismaClient();
async function main(){
 const owner=await prisma.user.upsert({where:{username:'platform-owner'},update:{},create:{username:'platform-owner',usernameNormalized:'platformowner',passwordHash:await bcrypt.hash('ChangeMe123!',12),role:UserRole.PLATFORM_OWNER,displayName:'Platform Owner',status:UserStatus.ACTIVE}});
 const school=await prisma.tenant.upsert({where:{id:'demo-school'},update:{},create:{id:'demo-school',name:'Beacon School',nickname:'BSS',status:TenantStatus.ACTIVE,settings:{create:{}}}});
 const admin=await prisma.user.upsert({where:{username:'BSS-admin'},update:{},create:{username:'BSS-admin',usernameNormalized:'bssadmin',passwordHash:await bcrypt.hash('Admin123!',12),role:UserRole.SCHOOL_ADMIN,displayName:'School Admin',email:'admin@beaconschool.example',tenantId:school.id,status:UserStatus.ACTIVE}});
 const year=await prisma.academicYear.upsert({where:{tenantId_name:{tenantId:school.id,name:'2026-2027'}},update:{isCurrent:true},create:{tenantId:school.id,name:'2026-2027',startsOn:new Date('2026-08-01'),endsOn:new Date('2027-06-30'),isCurrent:true}});
 const cls=await prisma.class.upsert({where:{tenantId_name:{tenantId:school.id,name:'Grade 8'}},update:{},create:{tenantId:school.id,name:'Grade 8',gradeNumber:8}});
 const sec=await prisma.section.upsert({where:{classId_name:{classId:cls.id,name:'A'}},update:{},create:{tenantId:school.id,classId:cls.id,name:'A'}});
 const tUser=await prisma.user.upsert({where:{username:'BSS-alikhan'},update:{},create:{username:'BSS-alikhan',usernameNormalized:'bssalikhan',passwordHash:await bcrypt.hash('Teacher123!',12),role:UserRole.TEACHER,displayName:'Ali Khan',tenantId:school.id,status:UserStatus.ACTIVE}});
 const teacher=await prisma.teacher.upsert({where:{userId:tUser.id},update:{},create:{tenantId:school.id,userId:tUser.id,employeeNo:'T-001'}});
 const sUser=await prisma.user.upsert({where:{username:'BSS-8A-ahmad-14'},update:{},create:{username:'BSS-8-A-ahmad-14',usernameNormalized:'bss8aahmad14',passwordHash:await bcrypt.hash('Student123!',12),role:UserRole.STUDENT,displayName:'Ahmad Zawar',tenantId:school.id,status:UserStatus.ACTIVE}});
 const student=await prisma.student.upsert({where:{userId:sUser.id},update:{currentSectionId:sec.id,rollNumber:14,admissionNo:'1021'},create:{tenantId:school.id,userId:sUser.id,currentSectionId:sec.id,rollNumber:14,admissionNo:'1021',guardianName:'Guardian',guardianPhone:'03000000000'}});
 await prisma.studentEnrollment.upsert({where:{studentId_academicYearId:{studentId:student.id,academicYearId:year.id}},update:{sectionId:sec.id},create:{tenantId:school.id,studentId:student.id,academicYearId:year.id,sectionId:sec.id}});
 const math=await prisma.subject.upsert({where:{tenantId_name:{tenantId:school.id,name:'Mathematics'}},update:{},create:{tenantId:school.id,name:'Mathematics',code:'MATH'}});
 await prisma.classSubject.upsert({where:{classId_subjectId:{classId:cls.id,subjectId:math.id}},update:{},create:{classId:cls.id,subjectId:math.id}});
 await prisma.teacherAssignment.upsert({where:{teacherId_sectionId_subjectId:{teacherId:teacher.id,sectionId:sec.id,subjectId:math.id}},update:{},create:{tenantId:school.id,teacherId:teacher.id,sectionId:sec.id,subjectId:math.id}});
 const as=await prisma.assessment.findFirst({where:{tenantId:school.id,subjectId:math.id,name:'Test 1'}})??await prisma.assessment.create({data:{tenantId:school.id,subjectId:math.id,name:'Test 1',maxMarks:100}});
 await prisma.mark.upsert({where:{assessmentId_studentId:{assessmentId:as.id,studentId:student.id}},update:{score:82,grade:'A'},create:{tenantId:school.id,assessmentId:as.id,studentId:student.id,score:82,grade:'A'}});
 await prisma.attendance.upsert({where:{studentId_sectionId_subjectId_date:{studentId:student.id,sectionId:sec.id,subjectId:math.id,date:new Date('2026-09-03')}},update:{status:AttendanceStatus.PRESENT,recordedBy:teacher.id},create:{tenantId:school.id,studentId:student.id,sectionId:sec.id,subjectId:math.id,date:new Date('2026-09-03'),status:AttendanceStatus.PRESENT,recordedBy:teacher.id}});
 console.log({owner:owner.username,admin:admin.username,teacher:tUser.username,student:sUser.username});
}
main().catch(e=>{console.error(e);process.exit(1)}).finally(()=>prisma.$disconnect());
