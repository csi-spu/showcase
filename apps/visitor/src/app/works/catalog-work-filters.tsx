import Link from 'next/link';
import { ChevronDownIcon, SearchIcon, SlidersHorizontalIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Field, FieldGroup, FieldLabel, FieldLegend, FieldSet } from '@/components/ui/field';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { Separator } from '@/components/ui/separator';
import { BlurFade } from '@/components/ui/blur-fade';
import type { CatalogSearchParams, PublicTag } from '@/lib/public-catalog-core';
import { CatalogSearchField } from '../catalog-search-field';
import { hasCatalogVariant } from '../catalog-url';

export interface CatalogWorkFilterLabels {
  academicYear: string;
  advancedFilters: string;
  all: string;
  apply: string;
  category: string;
  categoryAcademicArticle: string;
  categoryCompetitionEntry: string;
  categoryCourseWork: string;
  filterCount(count: number): string;
  reset: string;
  searchWorks: string;
  searchWorksPlaceholder: string;
  semester: string;
  semesterSummer: string;
  sort: string;
  sortAcademicPeriod: string;
  sortRecent: string;
  sortTitle: string;
  tags: string;
}

export function CatalogWorkFilters({
  labels,
  params,
  tags,
  years = [],
}: {
  labels: CatalogWorkFilterLabels;
  params: CatalogSearchParams;
  tags: PublicTag[];
  years?: number[];
}) {
  const selectedCategories = values(params.category);
  const selectedTags = values(params.tag);
  const advancedFilterCount =
    selectedCategories.length +
    selectedTags.length +
    Number(single(params.year) !== '') +
    Number(single(params.semester) !== '');
  const hasFilters = hasCatalogVariant(params, { limit: '24', sort: 'recent' });

  return (
    <BlurFade blur="4px" duration={0.28} offset={8}>
      <form
        className="rounded-media border border-border bg-card/75 p-4 shadow-[0_1.5rem_4rem_-3rem_color-mix(in_oklch,var(--primary),transparent_58%)] backdrop-blur-sm sm:p-5"
        method="get"
      >
        <FieldGroup className="gap-4">
          <div className="grid items-end gap-3 md:grid-cols-[minmax(0,1fr)_15rem_auto]">
            <CatalogSearchField
              defaultValue={single(params.q)}
              id="work-search"
              key={`works-${single(params.q)}`}
              label={labels.searchWorks}
              placeholder={labels.searchWorksPlaceholder}
              scope="works"
            />
            <Field>
              <FieldLabel htmlFor="work-sort">{labels.sort}</FieldLabel>
              <NativeSelect
                defaultValue={single(params.sort) || 'recent'}
                id="work-sort"
                name="sort"
              >
                <NativeSelectOption value="recent">{labels.sortRecent}</NativeSelectOption>
                <NativeSelectOption value="academic_period">
                  {labels.sortAcademicPeriod}
                </NativeSelectOption>
                <NativeSelectOption value="title">{labels.sortTitle}</NativeSelectOption>
              </NativeSelect>
            </Field>
            <Button className="h-12 px-5" type="submit">
              <SearchIcon data-icon="inline-start" />
              {labels.apply}
            </Button>
          </div>

          <details className="group" data-slot="advanced-filters" open={advancedFilterCount > 0}>
            <summary className="flex min-h-10 w-fit cursor-pointer list-none items-center gap-2 rounded-control px-2 text-sm font-medium text-primary outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-details-marker]:hidden">
              <SlidersHorizontalIcon aria-hidden="true" className="size-4" />
              {labels.advancedFilters}
              {advancedFilterCount > 0 ? (
                <span className="text-muted-foreground">
                  {labels.filterCount(advancedFilterCount)}
                </span>
              ) : null}
              <ChevronDownIcon
                aria-hidden="true"
                className="size-4 transition-transform group-open:rotate-180 motion-reduce:transition-none"
              />
            </summary>

            <div className="grid gap-6 pt-4">
              <Separator />
              <div className="grid gap-6 lg:grid-cols-[1.4fr_0.7fr_0.7fr]">
                <FieldSet>
                  <FieldLegend variant="label">{labels.category}</FieldLegend>
                  <FieldGroup data-slot="checkbox-group" className="grid gap-3 sm:grid-cols-3">
                    {[
                      ['course_work', labels.categoryCourseWork],
                      ['competition_entry', labels.categoryCompetitionEntry],
                      ['academic_article', labels.categoryAcademicArticle],
                    ].map(([value, label]) => {
                      const id = `category-${value}`;
                      return (
                        <Field key={value} orientation="horizontal">
                          <Checkbox
                            defaultChecked={selectedCategories.includes(value!)}
                            id={id}
                            name="category"
                            value={value}
                          />
                          <FieldLabel htmlFor={id}>{label}</FieldLabel>
                        </Field>
                      );
                    })}
                  </FieldGroup>
                </FieldSet>
                <Field>
                  <FieldLabel htmlFor="academic-year">{labels.academicYear}</FieldLabel>
                  <NativeSelect defaultValue={single(params.year)} id="academic-year" name="year">
                    <NativeSelectOption value="">{labels.all}</NativeSelectOption>
                    {years.map((year) => (
                      <NativeSelectOption key={year} value={String(year)}>
                        {year}
                      </NativeSelectOption>
                    ))}
                  </NativeSelect>
                </Field>
                <Field>
                  <FieldLabel htmlFor="semester">{labels.semester}</FieldLabel>
                  <NativeSelect
                    defaultValue={single(params.semester)}
                    id="semester"
                    name="semester"
                  >
                    <NativeSelectOption value="">{labels.all}</NativeSelectOption>
                    <NativeSelectOption value="1">1</NativeSelectOption>
                    <NativeSelectOption value="2">2</NativeSelectOption>
                    <NativeSelectOption value="summer">{labels.semesterSummer}</NativeSelectOption>
                  </NativeSelect>
                </Field>
              </div>

              {tags.length === 0 ? null : (
                <FieldSet>
                  <FieldLegend variant="label">{labels.tags}</FieldLegend>
                  <FieldGroup
                    className="grid gap-x-5 gap-y-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
                    data-slot="checkbox-group"
                  >
                    {tags.map((tag) => {
                      const id = `tag-${tag.publicId}`;
                      return (
                        <Field key={tag.publicId} orientation="horizontal">
                          <Checkbox
                            defaultChecked={selectedTags.includes(tag.publicId)}
                            id={id}
                            name="tag"
                            value={tag.publicId}
                          />
                          <FieldLabel htmlFor={id}>
                            {tag.displayLabel}
                            <span className="text-muted-foreground">({tag.activeWorkCount})</span>
                          </FieldLabel>
                        </Field>
                      );
                    })}
                  </FieldGroup>
                </FieldSet>
              )}
            </div>
          </details>

          {hasFilters ? (
            <Link
              className="w-fit text-sm font-medium text-primary underline-offset-4 hover:underline"
              href="/works"
            >
              {labels.reset}
            </Link>
          ) : null}
        </FieldGroup>
      </form>
    </BlurFade>
  );
}

function values(value: string | string[] | undefined): string[] {
  return value === undefined ? [] : Array.isArray(value) ? value : [value];
}

function single(value: string | string[] | undefined): string {
  return Array.isArray(value) ? (value[0] ?? '') : (value ?? '');
}
