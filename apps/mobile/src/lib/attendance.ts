import { colors } from '@/lib/theme';

/**
 * One filled colour per attendance status, used everywhere a status shows (student record, the register, the
 * teacher's view of a student). Amber is light, so its text is ink; the others carry white text.
 */
export const ATTENDANCE = {
  PRESENT: { label: 'Present', short: 'P', bg: colors.green, fg: '#ffffff' },
  ABSENT: { label: 'Absent', short: 'A', bg: colors.red, fg: '#ffffff' },
  LATE: { label: 'Late', short: 'L', bg: colors.amber, fg: colors.ink },
  LEAVE: { label: 'Leave', short: 'Lv', bg: colors.deep2, fg: '#ffffff' },
  EXCUSED: { label: 'Excused', short: 'E', bg: colors.muted, fg: '#ffffff' },
} as const;
export type AttendanceStatus = keyof typeof ATTENDANCE;
export const attendanceStyle = (s: string) => ATTENDANCE[s as AttendanceStatus] ?? ATTENDANCE.EXCUSED;
