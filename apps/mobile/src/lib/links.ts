/** Web links in notifications → app routes. */
export function mapLink(link: string): string {
  if (link.startsWith('/student/fees')) return '/(app)/fees';
  if (link.startsWith('/student/leave') || link.startsWith('/staff/leave')) return '/(app)/leave';
  if (link.startsWith('/student/marks')) return '/(app)/marks';
  if (link.startsWith('/staff/finance/claims')) return '/(app)/claims';
  if (link.startsWith('/staff/payslips')) return '/(app)/more/payslips';
  if (link.startsWith('/staff/attendance')) return '/(app)/attendance';
  return '/(app)';
}
