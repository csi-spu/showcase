import Link from 'next/link';
import { ArrowUpRightIcon, UsersRoundIcon } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { BlurFade } from '@/components/ui/blur-fade';
import type { PeopleCatalogCard } from '@/lib/public-catalog-core';
import { CatalogEmptyState, PersonPortrait } from '../catalog-artwork';

interface CatalogPeopleGridLabels {
  empty: string;
  entryYear(year: number): string;
  photoAlt(name: string): string;
  publishedWorks(count: number): string;
}

export function CatalogPeopleGrid({
  labels,
  people,
}: {
  labels: CatalogPeopleGridLabels;
  people: PeopleCatalogCard[];
}) {
  if (people.length === 0) {
    return <CatalogEmptyState icon={UsersRoundIcon} message={labels.empty} />;
  }

  return (
    <ol className="grid list-none gap-4 p-0 sm:grid-cols-2 xl:grid-cols-3">
      {people.map((person, index) => (
        <li key={person.publicId}>
          <BlurFade blur="4px" delay={Math.min(index, 5) * 0.06} duration={0.4} inView>
            <article
              className="group grid min-h-40 grid-cols-[7rem_minmax(0,1fr)] gap-4 rounded-media border border-border bg-card p-3 transition-[border-color,transform] duration-200 hover:-translate-y-0.5 hover:border-primary/30 motion-reduce:transform-none sm:grid-cols-[8.5rem_minmax(0,1fr)]"
              data-person-card-layout="compact"
            >
              <Link
                className="relative block aspect-square self-start overflow-hidden rounded-media border border-border bg-muted focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary"
                href={`/people/${person.publicId}`}
              >
                <PersonPortrait
                  alt={labels.photoAlt(person.displayName)}
                  person={person}
                  sizes="(max-width: 639px) 112px, 136px"
                />
                <span className="absolute top-2 right-2 grid size-9 place-items-center rounded-control bg-background/90 text-primary backdrop-blur-sm transition-transform duration-200 group-hover:-translate-y-0.5 group-hover:translate-x-0.5 motion-reduce:transform-none">
                  <ArrowUpRightIcon aria-hidden="true" className="size-4" />
                </span>
              </Link>
              <div className="flex min-w-0 flex-col items-start gap-2 py-1">
                <Badge className="w-fit" variant="secondary">
                  {labels.entryYear(person.entryYear)}
                </Badge>
                <h2 className="text-xl leading-snug font-semibold text-balance">
                  <Link
                    className="transition-colors duration-150 group-hover:text-primary focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary"
                    href={`/people/${person.publicId}`}
                  >
                    {person.displayName}
                  </Link>
                </h2>
                {person.bio ? (
                  <p className="line-clamp-3 text-sm leading-relaxed text-muted-foreground">
                    {person.bio}
                  </p>
                ) : null}
                <p className="mt-auto text-sm font-medium text-muted-foreground tabular-nums">
                  {labels.publishedWorks(person.publishedWorkCount)}
                </p>
              </div>
            </article>
          </BlurFade>
        </li>
      ))}
    </ol>
  );
}
