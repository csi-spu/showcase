import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { z } from 'zod';
import { PublicCatalogCoreClient, type CatalogSearchParams } from '@/lib/public-catalog-core';
import { getVisitorCoreUrl } from '@/lib/public-profile-core';
import { PublicShell } from '../../public-shell';
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
  const [tag, works] = await Promise.all([client.getTag(publicId), client.listWorks(workQuery)]);
  if (tag === null) notFound();
  return (
    <PublicShell>
      <div className="grid gap-10 px-[clamp(1rem,4vw,3rem)] py-10 lg:py-16">
        <header className="grid gap-4">
          <p className="text-sm font-semibold tracking-[0.16em] text-primary">TAG</p>
          <h1 className="text-[clamp(2.5rem,6vw,4.5rem)] leading-[1.15] font-semibold">
            {tag.displayLabel}
          </h1>
          <p className="text-muted-foreground">ผลงานเผยแพร่ {tag.activeWorkCount} ชิ้น</p>
        </header>
        <CatalogWorkGrid
          labels={{ empty: 'ไม่พบผลงาน', posterAlt: (title) => `โปสเตอร์ ${title}` }}
          works={works.items}
        />
        {works.hasNextPage && works.nextCursor ? (
          <Link
            className="min-h-11 justify-self-start rounded-control border border-input px-5 py-2 font-medium text-primary"
            href={catalogContinuationUrl(`/tags/${publicId}`, workQuery, works.nextCursor)}
            rel="next"
          >
            ดูเพิ่มเติม
          </Link>
        ) : null}
      </div>
    </PublicShell>
  );
}
