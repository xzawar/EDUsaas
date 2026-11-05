import type { Metadata } from 'next';
import { PageHeader } from '@/components/AppShell';
import { Card } from '@/components/ui';
import { PermissionsMatrix, SettingsForm } from '@/components/SchoolSettings';
import { requirePortal } from '@/server/auth/page';
import { getRolePermissions, getSchoolSettings } from '@/server/school/settings';
import { currentScheme } from '@/server/school/assessments';
import { GradingEditor } from '@/components/academics/GradingEditor';
import { SchoolSupportCard } from '@/components/support/SupportPanels';
import { listSupportGrants } from '@/server/school/support';
import { allLeaveTypes } from '@/server/school/leave';
import { LeaveTypesEditor } from '@/components/leave/LeaveTypesEditor';

export const metadata: Metadata = { title: 'Settings' };

export default async function SettingsPage() {
  const ctx = await requirePortal('STAFF', 'settings.manage');
  const [{ tenant, settings }, roles, scheme, grants, leaveTypes] = await Promise.all([
    getSchoolSettings(ctx),
    getRolePermissions(ctx),
    currentScheme(ctx),
    listSupportGrants(ctx),
    allLeaveTypes(ctx),
  ]);
  return (
    <>
      <PageHeader title="School settings" description={`${tenant.name} · username prefix "${tenant.prefix}"`} />
      <div className="space-y-6">
        <Card title="General" description="Applies to everyone at your school.">
          <SettingsForm
            initial={{
              timezone: settings.timezone,
              attendanceMode: settings.attendanceMode,
              atRiskThreshold: settings.atRiskThreshold,
              marksPublisher: settings.marksPublisher,
              leaveAgeOutHours: settings.leaveAgeOutHours,
            }}
          />
        </Card>
        {scheme && (
          <Card
            title="Grading scale"
            description={`${scheme.yearName} · version ${scheme.version}. Grades are based on the percentage scored.`}
          >
            <GradingEditor yearName={scheme.yearName} bands={scheme.bands} inUse={scheme.inUse} />
          </Card>
        )}
        <Card
          title="Leave types"
          description="What people can choose when they apply for leave. Retired types stay on past requests."
        >
          <LeaveTypesEditor types={JSON.parse(JSON.stringify(leaveTypes))} />
        </Card>
        <div id="permissions">
          <Card
            title="Role permissions"
            description="Choose what the Principal and Admissions Officer can do. Teacher and student access is fixed by the system."
          >
            <PermissionsMatrix initial={roles} />
          </Card>
        </div>
        <div id="support">
          <Card
            title="EDUsaas support access"
            description="You decide if and when our support team can look at your school."
          >
            <SchoolSupportCard grants={grants} />
          </Card>
        </div>
      </div>
    </>
  );
}
