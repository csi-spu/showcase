import type { Metadata } from 'next';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { SearchIcon } from 'lucide-react';
import { buttonVariants } from '@/components/ui/button';
import { PublicCatalogCoreClient, type CatalogSearchParams } from '@/lib/public-catalog-core';
import { getVisitorCoreUrl } from '@/lib/public-profile-core';
import { catalogContinuationUrl, hasCatalogVariant } from '../catalog-url';
import { PUBLIC_FIELD_CLASS, PUBLIC_FILTER_PANEL_CLASS, PublicPageIntro } from '../public-page';
import { PublicShell } from '../public-shell';
import { CatalogWorkGrid } from './catalog-work-grid';

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
  const [page, tags, t] = await Promise.all([
    client.listWorks(params),
    client.listPopularTags(),
    getTranslations('Catalog'),
  ]);
  const hasFilters = hasCatalogVariant(params, { limit: '24', sort: 'recent' });

  return (
    <PublicShell>
      <div className="grid gap-10 px-[clamp(1rem,4vw,3rem)] py-8 lg:gap-14 lg:py-12">
        <PublicPageIntro
          description={t('worksDescription')}
          eyebrow={t('eyebrow')}
          title={t('worksTitle')}
        />
        <form className={`${PUBLIC_FILTER_PANEL_CLASS} lg:grid-cols-12`} method="get">
          <label className="grid gap-2 lg:col-span-3">
            <span className="text-sm font-medium">{t('searchWorks')}</span>
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
                placeholder={t('searchWorksPlaceholder')}
                type="search"
              />
            </span>
          </label>
          <fieldset className="grid gap-2 lg:col-span-3">
            <legend className="text-sm font-medium">{t('category')}</legend>
            <div className="flex flex-wrap gap-3">
              {[
                ['course_work', t('categoryCourseWork')],
                ['competition_entry', t('categoryCompetitionEntry')],
                ['academic_article', t('categoryAcademicArticle')],
              ].map(([value, label]) => (
                <label
                  className="flex min-h-12 cursor-pointer items-center gap-2 rounded-control border border-border bg-background px-3 text-sm transition-colors duration-200 has-checked:border-primary has-checked:bg-primary-soft has-checked:text-primary"
                  key={value}
                >
                  <input
                    className="size-4 accent-primary"
                    defaultChecked={values(params.category).includes(value!)}
                    name="category"
                    type="checkbox"
                    value={value}
                  />
                  {label}
                </label>
              ))}
            </div>
          </fieldset>
          <label className="grid gap-2 lg:col-span-2">
            <span className="text-sm font-medium">{t('academicYear')}</span>
            <input
              className={PUBLIC_FIELD_CLASS}
              defaultValue={single(params.year)}
              inputMode="numeric"
              max={2700}
              min={2400}
              name="year"
              type="number"
            />
          </label>
          <label className="grid gap-2 lg:col-span-1">
            <span className="text-sm font-medium">{t('semester')}</span>
            <select
              className={PUBLIC_FIELD_CLASS}
              defaultValue={single(params.semester)}
              name="semester"
            >
              <option value="">{t('all')}</option>
              <option value="1">1</option>
              <option value="2">2</option>
              <option value="summer">{t('semesterSummer')}</option>
            </select>
          </label>
          <label className="grid gap-2 lg:col-span-2">
            <span className="text-sm font-medium">{t('sort')}</span>
            <select
              className={PUBLIC_FIELD_CLASS}
              defaultValue={single(params.sort) || 'recent'}
              name="sort"
            >
              <option value="recent">{t('sortRecent')}</option>
              <option value="academic_period">{t('sortAcademicPeriod')}</option>
              <option value="title">{t('sortTitle')}</option>
            </select>
          </label>
          <button
            className={buttonVariants({ className: 'min-h-12 self-end lg:col-span-1' })}
            type="submit"
          >
            {t('apply')}
          </button>
          {tags.length === 0 ? null : (
            <fieldset className="flex flex-wrap gap-2 border-t border-border pt-5 lg:col-span-12">
              <legend className="mb-2 text-sm font-medium">{t('tags')}</legend>
              {tags.map((tag) => (
                <label
                  className="flex min-h-11 cursor-pointer items-center gap-2 rounded-control border border-border bg-background px-3 text-sm transition-colors duration-200 has-checked:border-primary has-checked:bg-primary-soft has-checked:text-primary"
                  key={tag.publicId}
                >
                  <input
                    className="size-4 accent-primary"
                    defaultChecked={values(params.tag).includes(tag.publicId)}
                    name="tag"
                    type="checkbox"
                    value={tag.publicId}
                  />
                  {tag.displayLabel} ({tag.activeWorkCount})
                </label>
              ))}
            </fieldset>
          )}
          {hasFilters ? (
            <Link
              className={buttonVariants({
                className: 'justify-self-start lg:col-span-12',
                variant: 'link',
              })}
              href="/works"
            >
              {t('reset')}
            </Link>
          ) : null}
        </form>
        <section className="grid gap-8" aria-label={t('worksTitle')}>
          <CatalogWorkGrid
            labels={{
              empty: t('emptyWorks'),
              openWork: t('openWork'),
              posterAlt: (title) => t('posterAlt', { title }),
            }}
            works={page.items}
          />
          {page.hasNextPage && page.nextCursor ? (
            <Link
              className={buttonVariants({ className: 'min-h-11', variant: 'outline' })}
              href={catalogContinuationUrl('/works', params, page.nextCursor)}
              rel="next"
            >
              {t('more')}
            </Link>
          ) : null}
        </section>
      </div>
    </PublicShell>
  );
}

function values(value: string | string[] | undefined): string[] {
  return value === undefined ? [] : Array.isArray(value) ? value : [value];
}
function single(value: string | string[] | undefined): string {
  return Array.isArray(value) ? (value[0] ?? '') : (value ?? '');
}
