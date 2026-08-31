import { redirect } from 'next/navigation';
import { parseAdminWorkReference } from '@/lib/admin-work-reference';
import { workManagementHref } from '../works/work-management-view';

export default async function LegacyCorrectionsPage({
  searchParams,
}: {
  searchParams: Promise<{ cursor?: string; q?: string; workPublicId?: string }>;
}) {
  const query = await searchParams;
  const workPublicId = parseAdminWorkReference(query.workPublicId);
  if (workPublicId !== null) redirect(`/corrections/${workPublicId}`);

  const search = query.q?.trim() || undefined;
  redirect(
    workManagementHref('published', {
      ...(query.cursor === undefined ? {} : { cursor: query.cursor }),
      ...(search === undefined ? {} : { q: search }),
    }),
  );
}
