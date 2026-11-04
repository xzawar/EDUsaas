/** Human labels for audit actions (dashboard activity, audit-log viewer). Unknown actions get a readable fallback. */
export const ACTION_LABELS: Record<string, string> = {
  'auth.login': 'Signed in',
  'auth.logout': 'Signed out',
  'student.create': 'Student admitted',
  'student.update': 'Student updated',
  'student.update_guardian': 'Guardian details changed',
  'student.transfer': 'Student transferred',
  'student.withdraw': 'Student withdrawn',
  'student.restore': 'Student restored',
  'teacher.create': 'Teacher added',
  'teacher.assignments': 'Teacher assignments changed',
  'staff.create': 'Staff account created',
  'user.reset_password': 'Password reset',
  'section.incharge': 'Class Incharge changed',
  'section.renumber': 'Roll numbers renumbered',
  'promotion.run': 'Promotion run',
  'permissions.update': 'Permission changed',
  'settings.update': 'Settings changed',
  'year.create': 'Academic year created',
  'class.create': 'Class created',
  'access.denied': 'Access denied',
  'access.not_found': 'Blocked lookup',
  'attendance.submit': 'Register taken',
  'attendance.correct': 'Register corrected',
  'teacher_attendance.check_in': 'Teacher checked in',
  'teacher_attendance.correct': 'Teacher check-in corrected',
  'leave.apply': 'Leave requested',
  'leave.approve': 'Leave approved',
  'leave.reject': 'Leave not approved',
  'leave.cancel': 'Leave cancelled',
  'leave_type.create': 'Leave type added',
  'assessment.create': 'Test created',
  'assessment.delete': 'Test deleted',
  'marks.submit': 'Marks submitted',
  'marks.correct': 'Marks corrected',
  'marks.publish': 'Marks published',
  'grading.update': 'Grading scale changed',
  'remark.create': 'Remark added',
  'remark.approve': 'Remark approved',
  'remark.reject': 'Remark rejected',
  'timetable.set': 'Timetable changed',
  'timetable.clear': 'Lesson removed',
  'timetable.periods': 'School periods changed',
};

export function actionLabel(action: string): string {
  const known = ACTION_LABELS[action];
  if (known) return known;
  const words = action.replace(/[._]/g, ' ').trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}
