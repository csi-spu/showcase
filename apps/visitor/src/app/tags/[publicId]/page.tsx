import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { z } from 'zod';
import { buttonVariants } from '@/components/ui/button';
import { PublicCatalogCoreClient, type CatalogSearchParams } from '@/lib/public-catalog-core';
import { getVisitorCoreUrl } from '@/lib/public-profile-core';
import { PublicShell } from '../../public-shell';
import { PublicPageIntro } from '../../public-page';
import { catalogContinuationUrl } from '../../catalog-url';
import { CatalogWorkGrid } from '../../works/catalog-work-grid';

type Props = {
  params: Promise<{ publicId: string }>;
  searchParams: Promise<CatalogSearchParams>;
};

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const { publicId } = await params;
  const query = await searchParams;
  return {
    alternates: { canonical: `/tags/${publicId}` },
    robots: { follow: true, index: query.cursor === undefined },
    title: 'แท็กผลงาน | Student Showcase',
  };
}

export default async function TagPage({ params, searchParams }: Props) {
  const { publicId } = await params;
  const query = await searchParams;
  if (!z.uuid().safeParse(publicId).success) notFound();
  const client = new PublicCatalogCoreClient(getVisitorCoreUrl());
  const workQuery = { cursor: query.cursor, limit: '24', tag: publicId };
  const [tag, works, t] = await Promise.all([
    client.getTag(publicId),
    client.listWorks(workQuery),
    getTranslations('Tags'),
  ]);
  if (tag === null) notFound();
  return (
    <PublicShell>
      <div className="grid gap-10 px-[clamp(1rem,4vw,3rem)] py-8 lg:gap-14 lg:py-12">
        <PublicPageIntro
          description={t('count', { count: tag.activeWorkCount })}
          eyebrow={t('eyebrow')}
          title={tag.displayLabel}
        />
        <CatalogWorkGrid
          labels={{ empty: t('empty'), posterAlt: (title) => t('posterAlt', { title }) }}
          works={works.items}
        />
        {works.hasNextPage && works.nextCursor ? (
          <Link
            className={buttonVariants({ className: 'min-h-11', variant: 'outline' })}
            href={catalogContinuationUrl(`/tags/${publicId}`, workQuery, works.nextCursor)}
            rel="next"
          >
            {t('more')}
          </Link>
        ) : null}
      </div>
    </PublicShell>
  );
}
