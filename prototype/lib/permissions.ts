import type { UserRole } from '@prisma/client';
export type Permission = 'students.read'|'students.write'|'students.import'|'teachers.read'|'teachers.write'|'classes.write'|'academic.write'|'promotion.write'|'attendance.write'|'marks.write'|'leaves.approve'|'timetable.write'|'reports.read'|'audit.read'|'settings.write'|'announcements.write';
const fixed:Partial<Record<UserRole,Permission[]>>={
 PLATFORM_OWNER:['students.read','students.write','students.import','teachers.read','teachers.write','classes.write','academic.write','promotion.write','attendance.write','marks.write','leaves.approve','timetable.write','reports.read','audit.read','settings.write','announcements.write'],
 PLATFORM_ADMIN:['reports.read','audit.read'],
 SCHOOL_ADMIN:['students.read','students.write','students.import','teachers.read','teachers.write','classes.write','academic.write','promotion.write','attendance.write','marks.write','leaves.approve','timetable.write','reports.read','audit.read','settings.write','announcements.write'],
 ADMISSIONS_OFFICER:['students.read','students.write','students.import'],
 TEACHER:['students.read','attendance.write','marks.write'],
 STUDENT:[],
 PRINCIPAL:['students.read','teachers.read','reports.read'],
};
export function can(role:UserRole, perm:Permission, settings?:any){
  const list=fixed[role]||[]; if(list.includes(perm)) return true;
  if(role==='PRINCIPAL' && settings){ const map:any={'students.write':'principalCanStudents','promotion.write':'principalCanPromote','attendance.write':'principalCanAttendance','leaves.approve':'principalCanLeaves','marks.write':'principalCanMarks','timetable.write':'principalCanTimetable','audit.read':'principalCanAudit'}; const key=map[perm]; if(key) return Boolean(settings[key]); }
  return false;
}
