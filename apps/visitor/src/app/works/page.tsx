import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { PublicCatalogCoreClient, type CatalogSearchParams } from '@/lib/public-catalog-core';
import { getVisitorCoreUrl } from '@/lib/public-profile-core';
import { CatalogPagination } from '../catalog-pagination';
import { catalogPageWindow, hasCatalogVariant } from '../catalog-url';
import { PublicPageIntro } from '../public-page';
import { PublicShell } from '../public-shell';
import { CatalogWorkGrid } from './catalog-work-grid';
import { CatalogWorkFilters } from './catalog-work-filters';

type Props = { searchParams: Promise<CatalogSearchParams> };

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const params = await searchParams;
  return {
    alternates: { canonical: '/works' },
    robots: { follow: true, index: !hasCatalogVariant(params, { limit: '24', sort: 'recent' }) },
    title: 'ผลงาน | Student Showcase',
  };
}

export default async function WorksPage({ searchParams }: Props) {
  const params = await searchParams;
  const client = new PublicCatalogCoreClient(getVisitorCoreUrl());
  const [page, tags, filterOptions, t] = await Promise.all([
    client.listWorks(params),
    client.listPopularTags(),
    client.listFilterOptions(),
    getTranslations('Catalog'),
  ]);
  const pageWindow = catalogPageWindow('/works', params, page.nextCursor);
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
          description={t('worksDescription')}
          eyebrow={t('eyebrow')}
          title={t('worksTitle')}
        />
        <CatalogWorkFilters
          labels={{
            academicYear: t('academicYear'),
            advancedFilters: t('advancedFilters'),
            all: t('all'),
            apply: t('apply'),
            category: t('category'),
            categoryAcademicArticle: t('categoryAcademicArticle'),
            categoryCompetitionEntry: t('categoryCompetitionEntry'),
            categoryCourseWork: t('categoryCourseWork'),
            filterCount: (count) => t('filterCount', { count }),
            reset: t('reset'),
            searchWorks: t('searchWorks'),
            searchWorksPlaceholder: t('searchWorksPlaceholder'),
            semester: t('semester'),
            semesterSummer: t('semesterSummer'),
            sort: t('sort'),
            sortAcademicPeriod: t('sortAcademicPeriod'),
            sortRecent: t('sortRecent'),
            sortTitle: t('sortTitle'),
            tags: t('tags'),
          }}
          params={params}
          tags={tags}
          years={filterOptions.workYears}
        />
        <section className="grid gap-6" aria-label={t('worksTitle')}>
          <CatalogPagination
            ariaLabel={t('pagination')}
            labels={paginationLabels}
            window={pageWindow}
          />
          <CatalogWorkGrid
            labels={{ empty: t('emptyWorks'), posterAlt: (title) => t('posterAlt', { title }) }}
            works={page.items}
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
