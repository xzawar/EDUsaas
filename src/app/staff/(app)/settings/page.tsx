import type { Metadata } from 'next';
import { PageHeader } from '@/components/AppShell';
import { Card } from '@/components/ui';
import { PermissionsMatrix, SettingsForm } from '@/components/SchoolSettings';
import { requirePortal } from '@/server/auth/page';
import { getRolePermissions, getSchoolSettings } from '@/server/school/settings';
import { currentScheme } from '@/server/school/assessments';
import { GradingEditor } from '@/components/academics/GradingEditor';

export const metadata: Metadata = { title: 'Settings' };

export default async function SettingsPage() {
  const ctx = await requirePortal('STAFF', 'settings.manage');
  const [{ tenant, settings }, roles, scheme] = await Promise.all([
    getSchoolSettings(ctx),
    getRolePermissions(ctx),
    currentScheme(ctx),
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
        <div id="permissions">
          <Card
            title="Role permissions"
            description="Choose what the Principal and Admissions Officer can do. Teacher and student access is fixed by the system."
          >
            <PermissionsMatrix initial={roles} />
          </Card>
        </div>
      </div>
    </>
  );
}
