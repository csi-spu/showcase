import type { Metadata } from 'next';
import Link from 'next/link';
import { PublicCatalogCoreClient, type CatalogSearchParams } from '@/lib/public-catalog-core';
import { getVisitorCoreUrl } from '@/lib/public-profile-core';
import { catalogContinuationUrl, hasCatalogVariant } from '../catalog-url';
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
  const page = await new PublicCatalogCoreClient(getVisitorCoreUrl()).listPeople(params);
  return (
    <PublicShell>
      <div className="grid gap-10 px-[clamp(1rem,4vw,3rem)] py-10 lg:py-16">
        <header className="grid gap-4">
          <p className="text-sm font-semibold tracking-[0.16em] text-primary">PEOPLE</p>
          <h1 className="text-[clamp(2.5rem,6vw,4.5rem)] leading-[1.15] font-semibold">
            ผู้สร้างผลงาน
          </h1>
          <p className="max-w-2xl text-muted-foreground">โปรไฟล์ที่เจ้าของยินยอมให้เผยแพร่</p>
        </header>
        <form
          className="grid gap-5 border-y border-border py-6 md:grid-cols-[1fr_12rem_auto]"
          method="get"
        >
          <label className="grid gap-2">
            <span className="text-sm font-medium">ค้นหาชื่อ</span>
            <input
              className="min-h-11 rounded-control border border-input bg-card px-3"
              defaultValue={single(params.q)}
              maxLength={100}
              minLength={2}
              name="q"
              type="search"
            />
          </label>
          <label className="grid gap-2">
            <span className="text-sm font-medium">ปีที่เข้าศึกษา</span>
            <input
              className="min-h-11 rounded-control border border-input bg-card px-3"
              defaultValue={single(params.entryYear)}
              inputMode="numeric"
              max={2700}
              min={2400}
              name="entryYear"
              type="number"
            />
          </label>
          <button
            className="min-h-11 self-end rounded-control bg-primary px-5 font-medium text-primary-foreground"
            type="submit"
          >
            ค้นหา
          </button>
        </form>
        <CatalogPeopleGrid people={page.items} />
        {page.hasNextPage && page.nextCursor ? (
          <Link
            className="min-h-11 justify-self-start rounded-control border border-input px-5 py-2 font-medium text-primary"
            href={catalogContinuationUrl('/people', params, page.nextCursor)}
            rel="next"
          >
            ดูเพิ่มเติม
          </Link>
        ) : null}
      </div>
    </PublicShell>
  );
}

function single(value: string | string[] | undefined): string {
  return Array.isArray(value) ? (value[0] ?? '') : (value ?? '');
}
