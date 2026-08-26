import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { z } from 'zod';
import { getVisitorCoreUrl } from '@/lib/public-profile-core';
import { PublicWorkCoreClient } from '@/lib/public-work-core';
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
    <main className="mx-auto min-h-svh w-full max-w-[1440px] bg-background">
      <header className="border-b border-border px-[clamp(1rem,4vw,3rem)] py-6">
        <nav aria-label={t('navigation')} className="flex items-center justify-between gap-4">
          <Link className="font-semibold tracking-[0.12em]" href="/">
            STUDENT SHOWCASE
          </Link>
          <Link className="text-sm font-medium text-primary underline" href="/">
            {t('back')}
          </Link>
        </nav>
      </header>
      <div className="px-[clamp(1rem,4vw,3rem)] py-10 lg:py-16">
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
            links: t('links'),
            posterAlt: t('posterAlt', { title: work.title }),
            publishedAt: t('publishedAt', { value: formatBangkokDate(work.publishedAt) }),
            studyYear: (year) => t('studyYear', { year }),
            videos: t('videos'),
          }}
          work={work}
        />
      </div>
    </main>
  );
}

function formatBangkokDate(value: string): string {
  return new Intl.DateTimeFormat('th-TH', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Asia/Bangkok',
  }).format(new Date(value));
}
