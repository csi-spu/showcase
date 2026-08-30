import { redirect } from 'next/navigation';
import { parseAdminWorkReference } from '@/lib/admin-work-reference';
import { workManagementHref } from '../works/work-management-view';
import { resolveRecoveryQueueView } from './recovery-queue-view';

export default async function LegacyRecoveryQueuePage({
  searchParams,
}: {
  searchParams: Promise<{
    attributionCursor?: string;
    view?: string;
    workPublicId?: string;
  }>;
}) {
  const query = await searchParams;
  const workPublicId = parseAdminWorkReference(query.workPublicId);
  if (workPublicId !== null) redirect(`/recovery/${workPublicId}`);

  const view = resolveRecoveryQueueView(query.view);
  redirect(
    workManagementHref(view === 'attributions' ? 'attributions' : 'removals', {
      ...(view === 'attributions' && query.attributionCursor !== undefined
        ? { cursor: query.attributionCursor }
        : {}),
    }),
  );
}
