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
import { HomepageCollectionCarousel } from './homepage-collection-carousel';
import { WorkPosterImage } from './work-poster-image';

interface SectionLabels {
  artworkAlt: string;
  carouselNext: string;
  carouselPrevious: string;
  carouselRegion: string;
  description: string;
  eyebrow: string;
  title: string;
  viewAll: string;
}

interface HomepageFeaturedCollectionsLabels {
  academicArticles: SectionLabels;
  categoryBadge: Record<WorkCatalogCard['category'], string>;
  combined: SectionLabels;
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

/** Below this a category cannot carry its own section, so all works merge into one. */
const MIN_WORKS_PER_CATEGORY_SECTION = 3;
/** Upper bound on the merged row so the homepage stays a bounded read. */
const MAX_COMBINED_WORKS = 12;

type WorkSectionKind = 'academic-article' | 'combined' | 'competition-entry' | 'course-work';
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
  combined: { shape: 'square', src: '/images/home/course-work.webp' },
  people: { shape: 'square', src: '/images/home/people.webp' },
};

/**
 * Fractional bases keep the next card partly visible so the rail reads as
 * scrollable without needing a permanent affordance.
 */
const SECTION_CAROUSEL_ITEM_CLASSES: Record<WorkSectionKind | 'people', string> = {
  'academic-article': 'basis-4/5 sm:basis-2/5 lg:basis-[22%]',
  combined: 'basis-4/5 sm:basis-1/2 lg:basis-1/4',
  'competition-entry': 'basis-4/5 sm:basis-1/2 lg:basis-[38%]',
  'course-work': 'basis-4/5 sm:basis-[45%] lg:basis-[28%]',
  people: 'basis-3/5 sm:basis-[38%] lg:basis-[18%]',
};

/**
 * Short collections use a fixed card width rather than a viewport fraction, so
 * one or two cards stay a comfortable reading size while the group centres.
 */
const SECTION_SHORT_ITEM_CLASSES: Record<WorkSectionKind | 'people', string> = {
  'academic-article': 'w-[17rem] max-w-full',
  combined: 'w-[18rem] max-w-full',
  'competition-entry': 'w-[19rem] max-w-full',
  'course-work': 'w-[18rem] max-w-full',
  people: 'w-[15rem] max-w-full',
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
    artwork: 'md:col-span-5 lg:col-span-4',
    copy: 'md:col-span-7 lg:col-span-8',
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
  const categories = [courseWorks, competitionEntries, academicArticles];
  // While any category is too thin to carry its own section, a per-category
  // layout reads as gaps in the catalogue rather than as a curated homepage.
  // Merging keeps one dense, recent-first row until every category can stand alone.
  const isMerged = categories.some((works) => works.length < MIN_WORKS_PER_CATEGORY_SECTION);

  if (isMerged) {
    const combined = categories
      .flat()
      .sort((left, right) => right.publishedAt.localeCompare(left.publishedAt))
      .slice(0, MAX_COMBINED_WORKS);

    return (
      <div className="grid gap-12 lg:gap-16" data-homepage-collection-stage>
        <WorkCollectionSection
          categoryBadge={labels.categoryBadge}
          empty={labels.emptyWorks}
          href="/works"
          isHeaderReversed={false}
          labels={labels.combined}
          posterAlt={labels.posterAlt}
          sectionId="featured-combined-works"
          sectionKind="combined"
          works={combined}
        />
        <PeopleCollectionSection labels={labels} people={people} />
      </div>
    );
  }

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
  categoryBadge,
  empty,
  href,
  isHeaderReversed,
  labels,
  posterAlt,
  sectionId,
  sectionKind,
  works,
}: {
  categoryBadge?: Record<WorkCatalogCard['category'], string> | undefined;
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
        className="grid gap-6 lg:gap-8"
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
          <HomepageCollectionCarousel
            itemClassName={SECTION_CAROUSEL_ITEM_CLASSES[sectionKind]}
            shortItemClassName={SECTION_SHORT_ITEM_CLASSES[sectionKind]}
            items={works.map((work, workIndex) => ({
              content: (
                <BlurFade blur="4px" delay={workIndex * 0.07} duration={0.4} inView>
                  <FeaturedWorkCard
                    categoryLabel={categoryBadge?.[work.category]}
                    fallbackVariant={workIndex % 3}
                    posterAlt={posterAlt(work.title)}
                    work={work}
                  />
                </BlurFade>
              ),
              key: work.workPublicId,
            }))}
            labels={{
              next: labels.carouselNext,
              previous: labels.carouselPrevious,
              region: labels.carouselRegion,
            }}
          />
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
    // A contained, tinted panel echoes the hero surface, so the illustration reads
    // as lit inside a frame rather than floating on the bare page background.
    <header
      className="relative isolate grid items-center overflow-hidden rounded-media bg-primary-soft px-6 py-8 md:min-h-[20rem] md:grid-cols-12 md:px-10 md:py-10"
      data-header-direction={isReversed ? 'reverse' : 'normal'}
      data-header-surface="panel"
    >
      {/* Grounds the artwork in the panel: without it the illustration sits on flat
          fill and detaches from the copy beside it. */}
      <div
        aria-hidden="true"
        className={cn(
          'pointer-events-none absolute -z-10 hidden aspect-square w-[42rem] rounded-full bg-[radial-gradient(circle,color-mix(in_oklch,var(--primary),transparent_82%)_0%,transparent_70%)] md:block',
          isReversed ? '-left-32' : '-right-32',
        )}
      />
      <div
        className={cn(
          'relative z-10 grid content-center gap-4 py-2',
          layout.copy,
          isReversed ? 'md:order-2 md:pl-10' : 'md:pr-10',
        )}
      >
        <Badge
          className="w-fit border-primary/25 bg-white/70 text-primary backdrop-blur-sm"
          variant="outline"
        >
          {labels.eyebrow}
        </Badge>
        <h2
          className="text-[clamp(2rem,3.4vw,3.25rem)] leading-[1.1] font-semibold tracking-[-0.05em] text-balance"
          id={id}
        >
          {labels.title}
        </h2>
        <p className="max-w-xl text-base leading-relaxed text-muted-foreground sm:text-lg">
          {labels.description}
        </p>
        <Link
          className={cn(
            buttonVariants({ variant: 'link' }),
            'mt-1 h-auto w-fit px-0 transition-transform duration-200 hover:translate-x-1 motion-reduce:transform-none',
          )}
          href={href}
        >
          {labels.viewAll}
          <ArrowRightIcon aria-hidden="true" data-icon="inline-end" />
        </Link>
      </div>
      <div
        className={cn(
          'relative min-h-56 md:min-h-[20rem]',
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
  categoryLabel,
  fallbackVariant,
  posterAlt,
  work,
}: {
  categoryLabel?: string | undefined;
  fallbackVariant: number;
  posterAlt: string;
  work: WorkCatalogCard;
}) {
  return (
    <article data-work-card-layout="poster">
      <Link
        className="group relative block aspect-[5/7] overflow-hidden rounded-media border border-border focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary"
        href={`/works/${work.workPublicId}`}
      >
        {work.poster === null ? (
          <WorkPosterFallback title={work.title} variant={fallbackVariant} />
        ) : (
          <WorkPosterImage
            alt={posterAlt}
            className="h-full w-full object-cover transition-transform duration-500 ease-out group-hover:scale-[1.035] motion-reduce:transform-none"
            fallback={<WorkPosterFallback title={work.title} variant={fallbackVariant} />}
            loading="lazy"
            poster={work.poster}
            sizes="(max-width: 639px) 80vw, (max-width: 1023px) 50vw, 30vw"
            workPublicId={work.workPublicId}
          />
        )}
        <div aria-hidden="true" className={CARD_SCRIM_CLASS} />
        {/* The shared scrim only darkens the foot of the card, so badges moved to
            the head need their own gradient to stay legible over bright posters. */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 top-0 h-28 bg-[linear-gradient(to_bottom,rgba(0,0,0,0.65)_0%,rgba(0,0,0,0.25)_55%,rgba(0,0,0,0)_100%)]"
        />
        <div className="absolute inset-x-3 top-3 flex flex-wrap items-start gap-1.5 pr-11">
          {categoryLabel === undefined ? null : (
            <Badge
              className="w-fit border-white/35 bg-white/25 text-white backdrop-blur-sm"
              variant="outline"
            >
              {categoryLabel}
            </Badge>
          )}
          <Badge
            className="w-fit border-white/35 bg-white/15 text-white backdrop-blur-sm"
            variant="outline"
          >
            {work.academicPeriod.year} / {work.academicPeriod.semester}
          </Badge>
        </div>
        <span className="absolute top-3 right-3 grid size-10 place-items-center rounded-control bg-white/15 text-white backdrop-blur-sm transition-transform duration-200 group-hover:-translate-y-0.5 group-hover:translate-x-0.5 motion-reduce:transform-none">
          <ArrowUpRightIcon aria-hidden="true" className="size-4" />
        </span>
        <div className="absolute inset-x-0 bottom-0 grid gap-2 p-4 sm:p-5">
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
        className="grid gap-6 lg:gap-8"
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
          <HomepageCollectionCarousel
            itemClassName={SECTION_CAROUSEL_ITEM_CLASSES.people}
            shortItemClassName={SECTION_SHORT_ITEM_CLASSES.people}
            items={people.map((person, personIndex) => ({
              content: (
                <BlurFade blur="4px" delay={personIndex * 0.07} duration={0.4} inView>
                  <article data-person-card-layout="portrait">
                    <Link
                      className="group relative block aspect-[4/5] overflow-hidden rounded-media border border-border focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary"
                      href={`/people/${person.publicId}`}
                    >
                      <PersonPortrait
                        alt={labels.personPhotoAlt(`${person.firstName} ${person.lastName}`)}
                        person={person}
                        sizes="(max-width: 639px) 60vw, (max-width: 1023px) 38vw, 20vw"
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
              ),
              key: person.publicId,
            }))}
            labels={{
              next: labels.people.carouselNext,
              previous: labels.people.carouselPrevious,
              region: labels.people.carouselRegion,
            }}
          />
        )}
      </section>
    </BlurFade>
  );
}
