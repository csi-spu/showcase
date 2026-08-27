import type { Metadata } from 'next';
import Link from 'next/link';
import { SearchIcon } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import { buttonVariants } from '@/components/ui/button';
import { PublicCatalogCoreClient, type CatalogSearchParams } from '@/lib/public-catalog-core';
import { getVisitorCoreUrl } from '@/lib/public-profile-core';
import { catalogContinuationUrl, hasCatalogVariant } from '../catalog-url';
import { PUBLIC_FIELD_CLASS, PUBLIC_FILTER_PANEL_CLASS, PublicPageIntro } from '../public-page';
import { PublicShell } from '../public-shell';
import { CatalogPeopleGrid } from './catalog-people-grid';

type Props = { searchParams: Promise<CatalogSearchParams> };

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const params = await searchParams;
  return {
    alternates: { canonical: '/people' },
    robots: { follow: true, index: !hasCatalogVariant(params, { limit: '24', sort: 'name' }) },
    title: 'ผู้สร้าง | Student Showcase',
  };
}

export default async function PeoplePage({ searchParams }: Props) {
  const params = await searchParams;
  const [page, t] = await Promise.all([
    new PublicCatalogCoreClient(getVisitorCoreUrl()).listPeople(params),
    getTranslations('People'),
  ]);
  const hasFilters = hasCatalogVariant(params, { limit: '24', sort: 'name' });

  return (
    <PublicShell>
      <div className="grid gap-10 px-[clamp(1rem,4vw,3rem)] py-8 lg:gap-14 lg:py-12">
        <PublicPageIntro
          description={t('catalogDescription')}
          eyebrow={t('catalogEyebrow')}
          title={t('catalogTitle')}
        />
        <form className={`${PUBLIC_FILTER_PANEL_CLASS} md:grid-cols-[1fr_12rem_auto]`} method="get">
          <label className="grid gap-2">
            <span className="text-sm font-medium">{t('searchLabel')}</span>
            <span className="relative">
              <SearchIcon
                aria-hidden="true"
                className="absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted-foreground"
              />
              <input
                className={`${PUBLIC_FIELD_CLASS} pl-10`}
                defaultValue={single(params.q)}
                maxLength={100}
                minLength={2}
                name="q"
                placeholder={t('searchPlaceholder')}
                type="search"
              />
            </span>
          </label>
          <label className="grid gap-2">
            <span className="text-sm font-medium">{t('entryYearLabel')}</span>
            <input
              className={PUBLIC_FIELD_CLASS}
              defaultValue={single(params.entryYear)}
              inputMode="numeric"
              max={2700}
              min={2400}
              name="entryYear"
              type="number"
            />
          </label>
          <button className={buttonVariants({ className: 'min-h-12 self-end px-5' })} type="submit">
            {t('search')}
          </button>
          {hasFilters ? (
            <Link
              className={buttonVariants({ className: 'justify-self-start', variant: 'link' })}
              href="/people"
            >
              {t('reset')}
            </Link>
          ) : null}
        </form>
        <CatalogPeopleGrid
          labels={{
            empty: t('empty'),
            entryYear: (year) => t('entryYear', { year }),
            photoAlt: (name) => t('photoAlt', { name }),
            publishedWorks: (count) => t('publishedWorks', { count }),
          }}
          people={page.items}
        />
        {page.hasNextPage && page.nextCursor ? (
          <Link
            className={buttonVariants({ className: 'min-h-11', variant: 'outline' })}
            href={catalogContinuationUrl('/people', params, page.nextCursor)}
            rel="next"
          >
            {t('more')}
          </Link>
        ) : null}
      </div>
    </PublicShell>
  );
}

function single(value: string | string[] | undefined): string {
  return Array.isArray(value) ? (value[0] ?? '') : (value ?? '');
}
