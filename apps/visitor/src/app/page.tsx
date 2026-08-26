import { getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { PublicCatalogCoreClient } from '@/lib/public-catalog-core';
import { getVisitorCoreUrl } from '@/lib/public-profile-core';
import { CatalogWorkGrid } from './works/catalog-work-grid';
import { PublicShell } from './public-shell';

export const dynamic = 'force-dynamic';

export default async function Home() {
  const [t, catalog] = await Promise.all([
    getTranslations('Home'),
    new PublicCatalogCoreClient(getVisitorCoreUrl()).listWorks({ limit: '12', sort: 'recent' }),
  ]);

  return (
    <PublicShell>
      <div className="grid gap-16 px-[clamp(1rem,4vw,3rem)] py-12 lg:py-24">
        <header className="grid gap-5 lg:grid-cols-12">
          <div className="grid gap-4 lg:col-span-8">
            <p className="text-sm font-semibold tracking-[0.16em] text-primary">{t('eyebrow')}</p>
            <h1 className="text-[clamp(2.5rem,6vw,4.5rem)] leading-[1.15] font-semibold">
              {t('title')}
            </h1>
            <p className="max-w-2xl text-xl text-muted-foreground">{t('description')}</p>
          </div>
          <Link
            className="min-h-11 self-end justify-self-start rounded-control bg-primary px-5 py-2 font-medium text-primary-foreground lg:col-span-4 lg:justify-self-end"
            href="/works"
          >
            ดูผลงานทั้งหมด
          </Link>
        </header>
        <section className="grid gap-8" aria-labelledby="recent-works">
          <h2 className="text-2xl font-semibold" id="recent-works">
            ผลงานเผยแพร่ล่าสุด
          </h2>
          <CatalogWorkGrid
            isHomepage
            labels={{ empty: 'ยังไม่มีผลงานเผยแพร่', posterAlt: (title) => `โปสเตอร์ ${title}` }}
            works={catalog.items}
          />
          {catalog.hasNextPage ? (
            <Link
              className="min-h-11 justify-self-start rounded-control border border-input px-5 py-2 font-medium text-primary"
              href="/works"
            >
              ดูผลงานเพิ่มเติม
            </Link>
          ) : null}
        </section>
      </div>
    </PublicShell>
  );
}
