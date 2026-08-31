import { buttonVariants } from '@showcase/ui/button';
import { cn } from '@showcase/ui/cn';
import { ArrowRightIcon, ArrowUpRightIcon, UsersRoundIcon } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { BlurFade } from '@/components/ui/blur-fade';
import type { PeopleCatalogCard, WorkCatalogCard } from '@/lib/public-catalog-core';
import {
  CARD_SCRIM_CLASS,
  CatalogEmptyState,
  PersonPortrait,
  WorkPosterFallback,
} from './catalog-artwork';

interface SectionLabels {
  artworkAlt: string;
  description: string;
  title: string;
  viewAll: string;
}

interface HomepageFeaturedCollectionsLabels {
  academicArticles: SectionLabels;
  competitionEntries: SectionLabels;
  courseWorks: SectionLabels;
  emptyPeople: string;
  emptyWorks: string;
  people: SectionLabels;
  personPhotoAlt(name: string): string;
  posterAlt(title: string): string;
  publishedWorks(count: number): string;
  studentEntryYear(year: number): string;
}

type WorkSectionKind = 'academic-article' | 'competition-entry' | 'course-work';
type ArtworkShape = 'landscape' | 'portrait' | 'square';

const SECTION_ARTWORK: Record<WorkSectionKind | 'people', { shape: ArtworkShape; src: string }> = {
  'academic-article': {
    shape: 'landscape',
    src: '/images/home/academic-article.webp',
  },
  'competition-entry': {
    shape: 'portrait',
    src: '/images/home/competition-entry.webp',
  },
  'course-work': { shape: 'square', src: '/images/home/course-work.webp' },
  people: { shape: 'square', src: '/images/home/people.webp' },
};

const ARTWORK_LAYOUT_CLASSES: Record<
  ArtworkShape,
  { artwork: string; copy: string; shadow: string; shadowName: 'deep' | 'soft' | 'wide' }
> = {
  landscape: {
    artwork: 'md:col-span-7',
    copy: 'md:col-span-5',
    shadow: 'drop-shadow-[0_1.25rem_2.5rem_color-mix(in_oklch,var(--primary),transparent_78%)]',
    shadowName: 'wide',
  },
  portrait: {
    artwork: 'md:col-span-4',
    copy: 'md:col-span-8',
    shadow: 'drop-shadow-[0_1.75rem_1.6rem_color-mix(in_oklch,var(--primary),transparent_72%)]',
    shadowName: 'deep',
  },
  square: {
    artwork: 'md:col-span-5',
    copy: 'md:col-span-7',
    shadow: 'drop-shadow-[0_1.5rem_2rem_color-mix(in_oklch,var(--primary),transparent_75%)]',
    shadowName: 'soft',
  },
};

export function HomepageFeaturedCollections({
  academicArticles,
  competitionEntries,
  courseWorks,
  labels,
  people,
}: {
  academicArticles: WorkCatalogCard[];
  competitionEntries: WorkCatalogCard[];
  courseWorks: WorkCatalogCard[];
  labels: HomepageFeaturedCollectionsLabels;
  people: PeopleCatalogCard[];
}) {
  return (
    <div className="grid gap-12 lg:gap-16" data-homepage-collection-stage>
      <WorkCollectionSection
        empty={labels.emptyWorks}
        href="/works?category=course_work"
        labels={labels.courseWorks}
        isHeaderReversed={false}
        posterAlt={labels.posterAlt}
        sectionId="featured-course-works"
        sectionKind="course-work"
        works={courseWorks}
      />
      <WorkCollectionSection
        empty={labels.emptyWorks}
        href="/works?category=competition_entry"
        labels={labels.competitionEntries}
        isHeaderReversed
        posterAlt={labels.posterAlt}
        sectionId="featured-competition-entries"
        sectionKind="competition-entry"
        works={competitionEntries}
      />
      <WorkCollectionSection
        empty={labels.emptyWorks}
        href="/works?category=academic_article"
        labels={labels.academicArticles}
        isHeaderReversed={false}
        posterAlt={labels.posterAlt}
        sectionId="featured-academic-articles"
        sectionKind="academic-article"
        works={academicArticles}
      />
      <PeopleCollectionSection labels={labels} people={people} />
    </div>
  );
}

function WorkCollectionSection({
  empty,
  href,
  isHeaderReversed,
  labels,
  posterAlt,
  sectionId,
  sectionKind,
  works,
}: {
  empty: string;
  href: string;
  isHeaderReversed: boolean;
  labels: SectionLabels;
  posterAlt(title: string): string;
  sectionId: string;
  sectionKind: WorkSectionKind;
  works: WorkCatalogCard[];
}) {
  return (
    <BlurFade blur="6px" duration={0.45} inView>
      <section
        aria-labelledby={sectionId}
        className="grid gap-5 border-t border-border pt-6 lg:gap-6 lg:pt-8"
        data-section-layout={sectionKind}
      >
        <CollectionHeader
          artwork={SECTION_ARTWORK[sectionKind]}
          href={href}
          id={sectionId}
          isReversed={isHeaderReversed}
          labels={labels}
        />
        {works.length === 0 ? (
          <CatalogEmptyState message={empty} />
        ) : (
          <ol
            className="grid list-none gap-x-5 gap-y-9 p-0 sm:grid-cols-2 lg:grid-cols-3"
            data-featured-layout="standard"
          >
            {works.map((work, workIndex) => (
              <li key={work.workPublicId}>
                <BlurFade blur="4px" delay={workIndex * 0.07} duration={0.4} inView>
                  <FeaturedWorkCard
                    fallbackVariant={workIndex % 3}
                    posterAlt={posterAlt}
                    work={work}
                  />
                </BlurFade>
              </li>
            ))}
          </ol>
        )}
      </section>
    </BlurFade>
  );
}

function CollectionHeader({
  artwork,
  href,
  id,
  isReversed,
  labels,
}: {
  artwork: { shape: ArtworkShape; src: string };
  href: string;
  id: string;
  isReversed: boolean;
  labels: SectionLabels;
}) {
  const layout = ARTWORK_LAYOUT_CLASSES[artwork.shape];

  return (
    <header
      className="relative grid items-center md:min-h-[20rem] md:grid-cols-12"
      data-header-direction={isReversed ? 'reverse' : 'normal'}
      data-header-surface="open"
    >
      <div
        className={cn(
          'relative z-10 grid content-center gap-4 py-6 md:py-8',
          layout.copy,
          isReversed ? 'md:order-2 md:pl-8' : 'md:pr-8',
        )}
      >
        <h2
          className="text-[clamp(2.25rem,4vw,3.75rem)] leading-[1.08] font-semibold tracking-[-0.05em] text-balance"
          id={id}
        >
          {labels.title}
        </h2>
        <p className="max-w-xl text-base leading-relaxed text-muted-foreground sm:text-lg">
          {labels.description}
        </p>
        <Link
          className={buttonVariants({
            className:
              'mt-2 w-fit transition-transform duration-200 hover:translate-x-1 motion-reduce:transform-none',
            variant: 'link',
          })}
          href={href}
        >
          {labels.viewAll}
          <ArrowRightIcon aria-hidden="true" data-icon="inline-end" />
        </Link>
      </div>
      <div
        className={cn(
          'relative min-h-64 md:min-h-[20rem]',
          layout.artwork,
          isReversed && 'md:order-1',
        )}
        data-artwork-emphasis="balanced"
        data-artwork-shape={artwork.shape}
        data-artwork-shadow={layout.shadowName}
        data-section-artwork="true"
      >
        <Image
          alt={labels.artworkAlt}
          className={cn('object-contain', layout.shadow)}
          fill
          sizes="(max-width: 767px) 100vw, 58vw"
          src={artwork.src}
        />
      </div>
    </header>
  );
}

function FeaturedWorkCard({
  fallbackVariant,
  posterAlt,
  work,
}: {
  fallbackVariant: number;
  posterAlt(title: string): string;
  work: WorkCatalogCard;
}) {
  return (
    <article data-work-card-layout="poster">
      <Link
        className="group relative block aspect-[3/4] overflow-hidden rounded-media border border-border focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary"
        href={`/works/${work.workPublicId}`}
      >
        {work.poster === null ? (
          <WorkPosterFallback title={work.title} variant={fallbackVariant} />
        ) : (
          <FeaturedPoster
            alt={posterAlt(work.title)}
            poster={work.poster}
            workPublicId={work.workPublicId}
          />
        )}
        <div aria-hidden="true" className={CARD_SCRIM_CLASS} />
        <span className="absolute top-3 right-3 grid size-10 place-items-center rounded-control bg-white/15 text-white backdrop-blur-sm transition-transform duration-200 group-hover:-translate-y-0.5 group-hover:translate-x-0.5 motion-reduce:transform-none">
          <ArrowUpRightIcon aria-hidden="true" className="size-4" />
        </span>
        <div className="absolute inset-x-0 bottom-0 grid gap-2 p-4 sm:p-5">
          <Badge
            className="w-fit border-white/35 bg-white/15 text-white backdrop-blur-sm"
            variant="outline"
          >
            {work.academicPeriod.year} / {work.academicPeriod.semester}
          </Badge>
          <h3 className="line-clamp-2 text-lg leading-snug font-semibold text-balance text-white [text-shadow:0_1px_6px_rgb(0_0_0_/_60%)]">
            {work.title}
          </h3>
          <p className="line-clamp-2 text-sm leading-relaxed text-white/85 text-pretty [text-shadow:0_1px_4px_rgb(0_0_0_/_60%)]">
            {work.summary}
          </p>
        </div>
      </Link>
    </article>
  );
}

function FeaturedPoster({
  alt,
  poster,
  workPublicId,
}: {
  alt: string;
  poster: NonNullable<WorkCatalogCard['poster']>;
  workPublicId: string;
}) {
  const largest = poster.variants.at(-1);
  if (largest === undefined) return null;

  return (
    <picture>
      <source
        sizes="(max-width: 639px) 100vw, (max-width: 1023px) 50vw, 33vw"
        srcSet={poster.variants
          .map(
            (variant) =>
              `/works/${workPublicId}/media/${poster.assetId}/${variant.width} ${variant.width}w`,
          )
          .join(', ')}
        type="image/webp"
      />
      <Image
        alt={alt}
        className="h-full w-full object-cover transition-transform duration-500 ease-out group-hover:scale-[1.035] motion-reduce:transform-none"
        height={largest.height}
        loading="lazy"
        sizes="(max-width: 639px) 100vw, (max-width: 1023px) 50vw, 33vw"
        src={`/works/${workPublicId}/media/${poster.assetId}/${largest.width}`}
        unoptimized
        width={largest.width}
      />
    </picture>
  );
}

function PeopleCollectionSection({
  labels,
  people,
}: {
  labels: HomepageFeaturedCollectionsLabels;
  people: PeopleCatalogCard[];
}) {
  return (
    <BlurFade blur="6px" duration={0.45} inView>
      <section
        aria-labelledby="featured-people"
        className="grid gap-5 border-t border-border pt-6 lg:gap-6 lg:pt-8"
        data-section-layout="people"
      >
        <CollectionHeader
          artwork={SECTION_ARTWORK.people}
          href="/people"
          id="featured-people"
          isReversed
          labels={labels.people}
        />
        {people.length === 0 ? (
          <CatalogEmptyState icon={UsersRoundIcon} message={labels.emptyPeople} />
        ) : (
          <ol className="grid list-none gap-x-6 gap-y-12 sm:grid-cols-2 xl:grid-cols-4">
            {people.map((person, personIndex) => (
              <li key={person.publicId}>
                <BlurFade blur="4px" delay={personIndex * 0.07} duration={0.4} inView>
                  <article data-person-card-layout="portrait">
                    <Link
                      className="group relative block aspect-[4/5] overflow-hidden rounded-media border border-border focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary"
                      href={`/people/${person.publicId}`}
                    >
                      <PersonPortrait
                        alt={labels.personPhotoAlt(`${person.firstName} ${person.lastName}`)}
                        person={person}
                        sizes="(max-width: 639px) 100vw, (max-width: 1279px) 50vw, 25vw"
                      />
                      <div aria-hidden="true" className={CARD_SCRIM_CLASS} />
                      <span className="absolute top-3 right-3 grid size-10 place-items-center rounded-control bg-white/15 text-white backdrop-blur-sm transition-transform duration-200 group-hover:-translate-y-0.5 group-hover:translate-x-0.5 motion-reduce:transform-none">
                        <ArrowUpRightIcon aria-hidden="true" className="size-4" />
                      </span>
                      <div
                        className="absolute inset-x-0 bottom-0 grid gap-2 p-4 sm:p-5"
                        data-person-card-meta="true"
                      >
                        <Badge
                          className="w-fit border-white/35 bg-white/15 text-white backdrop-blur-sm"
                          variant="outline"
                        >
                          {labels.studentEntryYear(person.entryYear)}
                        </Badge>
                        <h3 className="line-clamp-2 text-lg leading-snug font-semibold text-balance text-white [text-shadow:0_1px_6px_rgb(0_0_0_/_60%)]">
                          {`${person.firstName} ${person.lastName}`}
                        </h3>
                        <p className="text-sm font-medium text-white/85 tabular-nums [text-shadow:0_1px_4px_rgb(0_0_0_/_60%)]">
                          {labels.publishedWorks(person.publishedWorkCount)}
                        </p>
                      </div>
                    </Link>
                  </article>
                </BlurFade>
              </li>
            ))}
          </ol>
        )}
      </section>
    </BlurFade>
  );
}
