import { ArrowLeftIcon } from 'lucide-react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { z } from 'zod';
import { buttonVariants } from '@/components/ui/button';
import { getVisitorCoreUrl } from '@/lib/public-profile-core';
import { PublicWorkCoreClient } from '@/lib/public-work-core';
import { PublicShell } from '../../public-shell';
import { PublicWorkView } from '../public-work-view';

export const dynamic = 'force-static';
export const revalidate = 60;

export default async function PublicWorkPage({
  params,
}: {
  params: Promise<{ publicId: string }>;
}) {
  const { publicId } = await params;
  if (!z.uuid().safeParse(publicId).success) notFound();
  const work = await new PublicWorkCoreClient(getVisitorCoreUrl()).getWork(publicId);
  if (work === null) notFound();
  const t = await getTranslations('Works');

  return (
    <PublicShell>
      <div className="grid gap-8 px-[clamp(1rem,4vw,3rem)] py-8 lg:gap-12 lg:py-12">
        <Link className={buttonVariants({ className: 'w-fit', variant: 'link' })} href="/works">
          <ArrowLeftIcon aria-hidden="true" data-icon="inline-start" />
          {t('back')}
        </Link>
        <PublicWorkView
          labels={{
            academicPeriod: t('academicPeriod', {
              semester: work.academicPeriod.semester,
              year: work.academicPeriod.year,
            }),
            attributions: t('attributions'),
            category: t(`categories.${work.category}`),
            description: t('description'),
            gallery: t('gallery'),
            galleryAlt: (index) => t('galleryAlt', { index, title: work.title }),
            links: t('links'),
            missingAttributions: t('missingAttributions'),
            missingPoster: t('missingPoster'),
            posterAlt: t('posterAlt', { title: work.title }),
            publishedAt: t('publishedAt', { value: formatBangkokDate(work.publishedAt) }),
            studyYear: (year) => t('studyYear', { year }),
            tagsLabel: t('tagsLabel'),
            videos: t('videos'),
          }}
          work={work}
        />
      </div>
    </PublicShell>
  );
}

function formatBangkokDate(value: string): string {
  return new Intl.DateTimeFormat('th-TH', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Asia/Bangkok',
  }).format(new Date(value));
}
