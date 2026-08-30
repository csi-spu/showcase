import { redirect } from 'next/navigation';
import { workManagementHref } from '../works/work-management-view';

export default async function LegacyReviewQueuePage({
  searchParams,
}: {
  searchParams: Promise<{ cursor?: string }>;
}) {
  const query = await searchParams;
  redirect(
    workManagementHref('reviews', {
      ...(query.cursor === undefined ? {} : { cursor: query.cursor }),
    }),
  );
}
