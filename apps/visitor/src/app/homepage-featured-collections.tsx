import { buttonVariants } from '@showcase/ui/button';
import { cn } from '@showcase/ui/cn';
import {
  ArrowRightIcon,
  ArrowUpRightIcon,
  FileTextIcon,
  type LucideIcon,
  StarIcon,
  TrophyIcon,
  UsersRoundIcon,
} from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { BlurFade } from '@/components/ui/blur-fade';
import type { PeopleCatalogCard, WorkCatalogCard } from '@/lib/public-catalog-core';
import {
  CARD_SCRIM_CLASS,
  CatalogEmptyState,
  PersonPortrait,
  personScrimClass,
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
  /** Continues the title on its own line, for a denser two-line heading. */
  titleSecondLine?: string | undefined;
  viewAll: string;
}

interface CatalogStats {
  competitionEntries: number;
  people: number;
  works: number;
}

interface CatalogStatsLabels {
  competitionEntries: string;
  label: string;
  people: string;
  works: string;
}

interface HomepageFeaturedCollectionsLabels {
  academicArticles: SectionLabels;
  categoryBadge: Record<WorkCatalogCard['category'], string>;
  combined: SectionLabels;
  competitionEntries: SectionLabels;
  courseWorks: SectionLabels;
  emptyPeople: string;
  emptyWorks: string;
  formatCount(count: number): string;
  people: SectionLabels;
  personPhotoAlt(name: string): string;
  posterAlt(title: string): string;
  publishedWorks(count: number): string;
  stats: CatalogStatsLabels;
  studentEntryYear(year: number): string;
}

/** Catalogue totals shown once, in the header of the first work section. */
interface CatalogStatsSummary {
  labels: CatalogStatsLabels;
  items: { icon: LucideIcon; label: string; tone: string; value: string }[];
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
 * On narrow viewports fractional bases keep the next card partly visible so the
 * rail reads as scrollable. Merged and people rails end on whole cards at wide
 * widths, where a half-cut card reads as broken and hover arrows signal scroll.
 */
const SECTION_CAROUSEL_ITEM_CLASSES: Record<WorkSectionKind | 'people', string> = {
  'academic-article': 'basis-4/5 sm:basis-2/5 lg:basis-[22%]',
  combined: 'basis-4/5 sm:basis-1/2 lg:basis-1/4',
  'competition-entry': 'basis-4/5 sm:basis-1/2 lg:basis-[38%]',
  'course-work': 'basis-4/5 sm:basis-[45%] lg:basis-[28%]',
  people: 'basis-3/5 sm:basis-1/3 lg:basis-1/5',
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

/** Card chrome shared by the work poster and person portrait cards. */
const CARD_LINK_CLASS =
  'group relative block overflow-hidden rounded-media border border-border shadow-[0_1.25rem_2.5rem_-1.5rem_rgba(19,15,25,0.55)] transition-shadow duration-300 hover:shadow-[0_1.5rem_3rem_-1.25rem_rgba(19,15,25,0.6)] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary motion-reduce:transition-none';
/** An opaque tile stays visible over both dark photos and light initials tiles. */
const CARD_ARROW_CLASS =
  'absolute top-3 right-3 grid size-9 place-items-center rounded-control bg-white/90 text-foreground shadow-sm backdrop-blur-sm transition-transform duration-200 group-hover:-translate-y-0.5 group-hover:translate-x-0.5 motion-reduce:transform-none';
const CARD_LIGHT_PILL_CLASS = 'border-white/60 bg-white/85 text-foreground backdrop-blur-sm';

export function HomepageFeaturedCollections({
  academicArticles,
  competitionEntries,
  courseWorks,
  labels,
  people,
  stats,
}: {
  academicArticles: WorkCatalogCard[];
  competitionEntries: WorkCatalogCard[];
  courseWorks: WorkCatalogCard[];
  labels: HomepageFeaturedCollectionsLabels;
  people: PeopleCatalogCard[];
  stats: CatalogStats;
}) {
  const statsSummary: CatalogStatsSummary = {
    items: [
      {
        icon: FileTextIcon,
        label: labels.stats.works,
        tone: 'bg-primary-soft text-primary',
        value: labels.formatCount(stats.works),
      },
      {
        icon: UsersRoundIcon,
        label: labels.stats.people,
        tone: 'bg-information-background text-information',
        value: labels.formatCount(stats.people),
      },
      {
        icon: TrophyIcon,
        label: labels.stats.competitionEntries,
        tone: 'bg-warning-background text-warning',
        value: labels.formatCount(stats.competitionEntries),
      },
    ],
    labels: labels.stats,
  };
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
          labels={labels.combined}
          posterAlt={labels.posterAlt}
          sectionId="featured-combined-works"
          sectionKind="combined"
          stats={statsSummary}
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
        posterAlt={labels.posterAlt}
        sectionId="featured-course-works"
        sectionKind="course-work"
        stats={statsSummary}
        works={courseWorks}
      />
      <WorkCollectionSection
        empty={labels.emptyWorks}
        href="/works?category=competition_entry"
        labels={labels.competitionEntries}
        posterAlt={labels.posterAlt}
        sectionId="featured-competition-entries"
        sectionKind="competition-entry"
        works={competitionEntries}
      />
      <WorkCollectionSection
        empty={labels.emptyWorks}
        href="/works?category=academic_article"
        labels={labels.academicArticles}
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
  labels,
  posterAlt,
  sectionId,
  sectionKind,
  stats,
  works,
}: {
  categoryBadge?: Record<WorkCatalogCard['category'], string> | undefined;
  empty: string;
  href: string;
  labels: SectionLabels;
  posterAlt(title: string): string;
  sectionId: string;
  sectionKind: WorkSectionKind;
  stats?: CatalogStatsSummary | undefined;
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
          labels={labels}
          stats={stats}
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
  labels,
  stats,
}: {
  artwork: { shape: ArtworkShape; src: string };
  href: string;
  id: string;
  labels: SectionLabels;
  stats?: CatalogStatsSummary | undefined;
}) {
  const layout = ARTWORK_LAYOUT_CLASSES[artwork.shape];

  return (
    // The header sits on the page itself so the collection below reads as part of
    // the same composition; a soft glow grounds the artwork instead of a panel.
    <header
      className="relative isolate grid items-center gap-8 md:min-h-[20rem] md:grid-cols-12 md:gap-0"
      data-header-surface="open"
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute top-1/2 -right-40 -z-10 hidden aspect-square w-[40rem] -translate-y-1/2 rounded-full bg-[radial-gradient(circle,color-mix(in_oklch,var(--primary),transparent_86%)_0%,transparent_68%)] md:block"
      />
      <div className={cn('relative z-10 grid content-center gap-5 md:pr-10', layout.copy)}>
        <Badge
          className="border-primary/15 bg-primary-soft px-3 py-1 text-primary"
          variant="outline"
        >
          <StarIcon aria-hidden="true" data-icon="inline-start" fill="currentColor" />
          {labels.eyebrow}
        </Badge>
        <h2
          className="text-[clamp(2.5rem,4.6vw,4.5rem)] leading-[1.12] font-semibold tracking-[-0.04em] text-balance text-foreground"
          id={id}
        >
          {labels.titleSecondLine === undefined ? (
            labels.title
          ) : (
            <>
              <span className="block">{labels.title}</span>
              <span className="block w-fit bg-[linear-gradient(90deg,var(--primary)_0%,color-mix(in_oklch,var(--primary),#6d28d9_60%)_100%)] bg-clip-text pb-[0.08em] text-transparent">
                {labels.titleSecondLine}
              </span>
            </>
          )}
        </h2>
        <p className="max-w-xl text-base leading-relaxed text-muted-foreground sm:text-lg">
          {labels.description}
        </p>
        <div className="mt-1 flex flex-wrap items-center gap-x-6 gap-y-5">
          <Link
            className={buttonVariants({
              className:
                'transition-[transform,background-color] duration-200 hover:-translate-y-0.5 motion-reduce:transform-none',
              size: 'lg',
            })}
            data-collection-cta="true"
            href={href}
          >
            {labels.viewAll}
            <ArrowRightIcon aria-hidden="true" data-icon="inline-end" />
          </Link>
          {stats === undefined ? null : <CatalogStatsList stats={stats} />}
        </div>
      </div>
      <div
        className={cn('relative min-h-56 md:min-h-[20rem]', layout.artwork)}
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

function CatalogStatsList({ stats }: { stats: CatalogStatsSummary }) {
  return (
    <dl
      aria-label={stats.labels.label}
      className="flex flex-wrap items-center gap-x-6 gap-y-4 sm:border-l sm:border-border sm:pl-6"
      data-catalog-stats="true"
    >
      {stats.items.map(({ icon: Icon, label, tone, value }) => (
        <div className="flex items-center gap-3" key={label}>
          <span
            aria-hidden="true"
            className={cn('grid size-11 shrink-0 place-items-center rounded-control', tone)}
          >
            <Icon className="size-5" />
          </span>
          <div className="flex flex-col">
            <dt className="order-2 text-sm text-muted-foreground">{label}</dt>
            <dd className="order-1 text-xl leading-tight font-semibold tabular-nums">{value}</dd>
          </div>
        </div>
      ))}
    </dl>
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
      <Link className={cn(CARD_LINK_CLASS, 'aspect-[7/8]')} href={`/works/${work.workPublicId}`}>
        {work.poster === null ? (
          <WorkPosterFallback title={work.title} variant={fallbackVariant} />
        ) : (
          <WorkPosterImage
            alt={posterAlt}
            // Posters are portrait and usually lead with their headline, so the
            // shorter card keeps the top of the poster rather than its centre.
            className="h-full w-full object-cover object-top transition-transform duration-500 ease-out group-hover:scale-[1.035] motion-reduce:transform-none"
            fallback={<WorkPosterFallback title={work.title} variant={fallbackVariant} />}
            loading="lazy"
            poster={work.poster}
            sizes="(max-width: 639px) 80vw, (max-width: 1023px) 50vw, 25vw"
            workPublicId={work.workPublicId}
          />
        )}
        <div aria-hidden="true" className={CARD_SCRIM_CLASS} />
        {/* The shared scrim only darkens the foot of the card, so badges at the
            head need their own gradient to stay legible over bright posters. */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 top-0 h-24 bg-[linear-gradient(to_bottom,rgba(0,0,0,0.45)_0%,rgba(0,0,0,0)_100%)]"
        />
        <div className="absolute inset-x-3 top-3 flex flex-wrap items-start gap-1.5 pr-12">
          {categoryLabel === undefined ? null : (
            <Badge className={CARD_LIGHT_PILL_CLASS} variant="outline">
              {categoryLabel}
            </Badge>
          )}
          <Badge
            className="border-white/25 bg-black/40 text-white tabular-nums backdrop-blur-sm"
            variant="outline"
          >
            {work.academicPeriod.year} / {work.academicPeriod.semester}
          </Badge>
        </div>
        <span className={CARD_ARROW_CLASS}>
          <ArrowUpRightIcon aria-hidden="true" className="size-4" />
        </span>
        <div className="absolute inset-x-0 bottom-0 grid gap-1.5 p-4 sm:p-5">
          <h3 className="line-clamp-2 text-lg leading-snug font-semibold text-balance text-white [text-shadow:0_1px_6px_rgb(0_0_0_/_60%)]">
            {work.title}
          </h3>
          <p className="line-clamp-2 text-sm leading-relaxed text-white/80 text-pretty [text-shadow:0_1px_4px_rgb(0_0_0_/_60%)]">
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
                      className={cn(CARD_LINK_CLASS, 'aspect-[4/5]')}
                      href={`/people/${person.publicId}`}
                    >
                      <PersonPortrait
                        alt={labels.personPhotoAlt(`${person.firstName} ${person.lastName}`)}
                        person={person}
                        sizes="(max-width: 639px) 60vw, (max-width: 1023px) 38vw, 20vw"
                      />
                      <div aria-hidden="true" className={personScrimClass(person)} />
                      <Badge
                        className={cn(CARD_LIGHT_PILL_CLASS, 'absolute top-3 left-3')}
                        variant="outline"
                      >
                        {labels.studentEntryYear(person.entryYear)}
                      </Badge>
                      <span className={CARD_ARROW_CLASS}>
                        <ArrowUpRightIcon aria-hidden="true" className="size-4" />
                      </span>
                      <div
                        className="absolute inset-x-0 bottom-0 grid gap-1.5 p-4 sm:p-5"
                        data-person-card-meta="true"
                      >
                        <h3 className="line-clamp-2 text-lg leading-snug font-semibold text-balance text-white [text-shadow:0_1px_6px_rgb(0_0_0_/_60%)]">
                          {`${person.firstName} ${person.lastName}`}
                        </h3>
                        <p className="text-sm font-medium text-white/80 tabular-nums [text-shadow:0_1px_4px_rgb(0_0_0_/_60%)]">
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
