import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { PublicCatalogCoreClient, type CatalogSearchParams } from '@/lib/public-catalog-core';
import { getVisitorCoreUrl } from '@/lib/public-profile-core';
import { CatalogPagination } from '../catalog-pagination';
import { catalogPageWindow, hasCatalogVariant } from '../catalog-url';
import { PublicPageIntro } from '../public-page';
import { PublicShell } from '../public-shell';
import { CatalogPeopleGrid } from './catalog-people-grid';
import { CatalogPeopleFilters } from './catalog-people-filters';

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
  const client = new PublicCatalogCoreClient(getVisitorCoreUrl());
  const [page, filterOptions, t] = await Promise.all([
    client.listPeople(params),
    client.listFilterOptions(),
    getTranslations('People'),
  ]);
  const pageWindow = catalogPageWindow('/people', params, page.totalPages);
  const paginationLabels = {
    ellipsis: t('ellipsis'),
    goToPage: (pageNumber: number) => t('goToPage', { page: pageNumber }),
    nextPage: t('nextPage'),
    previousPage: t('previousPage'),
  };

  return (
    <PublicShell>
      <div className="grid gap-10 px-[clamp(1rem,4vw,3rem)] py-8 lg:gap-14 lg:py-12">
        <PublicPageIntro
          description={t('catalogDescription')}
          eyebrow={t('catalogEyebrow')}
          title={t('catalogTitle')}
        />
        <CatalogPeopleFilters
          entryYears={filterOptions.entryYears}
          labels={{
            all: t('all'),
            entryYear: t('entryYearLabel'),
            reset: t('reset'),
            search: t('search'),
            searchLabel: t('searchLabel'),
            searchPlaceholder: t('searchPlaceholder'),
          }}
          params={params}
        />
        <section className="grid gap-6" aria-label={t('catalogTitle')}>
          <CatalogPagination
            ariaLabel={t('pagination')}
            labels={paginationLabels}
            window={pageWindow}
          />
          <CatalogPeopleGrid
            labels={{
              empty: t('empty'),
              entryYear: (year) => t('entryYear', { year }),
              photoAlt: (name) => t('photoAlt', { name }),
              publishedWorks: (count) => t('publishedWorks', { count }),
            }}
            people={page.items}
          />
          <CatalogPagination
            ariaLabel={t('pagination')}
            labels={paginationLabels}
            window={pageWindow}
          />
        </section>
      </div>
    </PublicShell>
  );
}
