import Link from 'next/link';
import { buttonVariants } from '@/components/ui/button';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import type { CatalogSearchParams } from '@/lib/public-catalog-core';
import { CatalogSearchField } from '../catalog-search-field';
import { hasCatalogVariant } from '../catalog-url';
import { PUBLIC_FILTER_PANEL_CLASS } from '../public-page';

interface CatalogPeopleFilterLabels {
  all: string;
  entryYear: string;
  reset: string;
  search: string;
  searchLabel: string;
  searchPlaceholder: string;
}

export function CatalogPeopleFilters({
  entryYears,
  labels,
  params,
}: {
  entryYears: number[];
  labels: CatalogPeopleFilterLabels;
  params: CatalogSearchParams;
}) {
  const hasFilters = hasCatalogVariant(params, { limit: '24', sort: 'name' });

  return (
    <form className={`${PUBLIC_FILTER_PANEL_CLASS} md:grid-cols-[1fr_12rem_auto]`} method="get">
      <CatalogSearchField
        defaultValue={single(params.q)}
        id="people-search"
        key={`people-${single(params.q)}`}
        label={labels.searchLabel}
        placeholder={labels.searchPlaceholder}
        scope="people"
      />
      <label className="grid gap-2">
        <span className="text-sm font-medium">{labels.entryYear}</span>
        <NativeSelect defaultValue={single(params.entryYear)} name="entryYear">
          <NativeSelectOption value="">{labels.all}</NativeSelectOption>
          {entryYears.map((year) => (
            <NativeSelectOption key={year} value={String(year)}>
              {year}
            </NativeSelectOption>
          ))}
        </NativeSelect>
      </label>
      <button className={buttonVariants({ className: 'min-h-12 self-end px-5' })} type="submit">
        {labels.search}
      </button>
      {hasFilters ? (
        <Link
          className={buttonVariants({ className: 'justify-self-start', variant: 'link' })}
          href="/people"
        >
          {labels.reset}
        </Link>
      ) : null}
    </form>
  );
}

function single(value: string | string[] | undefined): string {
  return Array.isArray(value) ? (value[0] ?? '') : (value ?? '');
}
