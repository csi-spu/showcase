import type { Metadata } from 'next';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { PublicCatalogCoreClient, type CatalogSearchParams } from '@/lib/public-catalog-core';
import { getVisitorCoreUrl } from '@/lib/public-profile-core';
import { catalogContinuationUrl, hasCatalogVariant } from '../catalog-url';
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
  return (
    <PublicShell>
      <div className="grid gap-10 px-[clamp(1rem,4vw,3rem)] py-10 lg:grid-cols-12 lg:py-16">
        <header className="grid gap-4 lg:col-span-8">
          <p className="text-sm font-semibold tracking-[0.16em] text-primary">PUBLIC CATALOG</p>
          <h1 className="text-[clamp(2.5rem,6vw,4.5rem)] leading-[1.15] font-semibold">
            {t('worksTitle')}
          </h1>
          <p className="max-w-2xl text-muted-foreground">{t('worksDescription')}</p>
        </header>
        <form
          className="grid gap-5 border-y border-border py-6 lg:col-span-12 lg:grid-cols-12"
          method="get"
        >
          <label className="grid gap-2 lg:col-span-3">
            <span className="text-sm font-medium">{t('searchWorks')}</span>
            <input
              className="min-h-11 rounded-control border border-input bg-card px-3 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
              defaultValue={single(params.q)}
              maxLength={100}
              minLength={2}
              name="q"
              type="search"
            />
          </label>
          <fieldset className="grid gap-2 lg:col-span-3">
            <legend className="text-sm font-medium">{t('category')}</legend>
            <div className="flex flex-wrap gap-3">
              {[
                ['course_work', 'ผลงานรายวิชา'],
                ['competition_entry', 'ผลงานประกวด'],
                ['academic_article', 'บทความวิชาการ'],
              ].map(([value, label]) => (
                <label className="flex min-h-11 items-center gap-2" key={value}>
                  <input
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
              className="min-h-11 rounded-control border border-input bg-card px-3"
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
              className="min-h-11 rounded-control border border-input bg-card px-3"
              defaultValue={single(params.semester)}
              name="semester"
            >
              <option value="">{t('all')}</option>
              <option value="1">1</option>
              <option value="2">2</option>
              <option value="summer">ฤดูร้อน</option>
            </select>
          </label>
          <label className="grid gap-2 lg:col-span-2">
            <span className="text-sm font-medium">{t('sort')}</span>
            <select
              className="min-h-11 rounded-control border border-input bg-card px-3"
              defaultValue={single(params.sort) || 'recent'}
              name="sort"
            >
              <option value="recent">ล่าสุด</option>
              <option value="academic_period">ช่วงการศึกษา</option>
              <option value="title">ชื่อผลงาน</option>
            </select>
          </label>
          <button
            className="min-h-11 self-end rounded-control bg-primary px-4 font-medium text-primary-foreground lg:col-span-1"
            type="submit"
          >
            {t('apply')}
          </button>
          {tags.length === 0 ? null : (
            <fieldset className="flex flex-wrap gap-3 lg:col-span-12">
              <legend className="mb-2 text-sm font-medium">{t('tags')}</legend>
              {tags.map((tag) => (
                <label
                  className="flex min-h-11 items-center gap-2 rounded-full bg-primary-soft px-4 text-sm text-primary"
                  key={tag.publicId}
                >
                  <input
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
        </form>
        <section className="grid gap-8 lg:col-span-12" aria-label={t('worksTitle')}>
          <CatalogWorkGrid
            labels={{ empty: t('emptyWorks'), posterAlt: (title) => t('posterAlt', { title }) }}
            works={page.items}
          />
          {page.hasNextPage && page.nextCursor ? (
            <Link
              className="min-h-11 justify-self-start rounded-control border border-input px-5 py-2 font-medium text-primary"
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
