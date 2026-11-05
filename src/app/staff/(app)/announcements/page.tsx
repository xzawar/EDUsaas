import type { Metadata } from 'next';
import { PageHeader } from '@/components/AppShell';
import { AnnouncementList, NewAnnouncementButton } from '@/components/comms/Announcements';
import { requirePortal } from '@/server/auth/page';
import { listAnnouncements } from '@/server/school/announcements';
import { listSections } from '@/server/school/structure';

export const metadata: Metadata = { title: 'Announcements' };

export default async function AnnouncementsPage() {
  const ctx = await requirePortal('STAFF');
  const canManage = ctx.can('announcements.manage');
  const [items, sections] = await Promise.all([
    listAnnouncements(ctx, { manage: true }),
    canManage ? listSections(ctx) : Promise.resolve([]),
  ]);
  return (
    <>
      <PageHeader
        title="Announcements"
        description={
          canManage ? 'Post news for everyone, all staff, all students or one section.' : 'News from the school.'
        }
        actions={
          canManage ? (
            <NewAnnouncementButton sections={sections.map((s) => ({ id: s.id, label: s.label }))} />
          ) : undefined
        }
      />
      <div className="max-w-3xl">
        <AnnouncementList
          items={items}
          canManage={canManage}
          empty={
            canManage ? 'Nothing posted yet. Your first announcement will appear here.' : 'No announcements right now.'
          }
        />
      </div>
    </>
  );
}
