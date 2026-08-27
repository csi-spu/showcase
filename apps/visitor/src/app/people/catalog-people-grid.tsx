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
    <ol className="grid list-none gap-x-6 gap-y-12 p-0 sm:grid-cols-2 xl:grid-cols-3">
      {people.map((person, index) => (
        <li key={person.publicId}>
          <BlurFade blur="4px" delay={Math.min(index, 5) * 0.06} duration={0.4} inView>
            <article className="group grid gap-5">
              <Link
                className="relative block aspect-[4/5] overflow-hidden rounded-media border border-border bg-muted focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary"
                href={`/people/${person.publicId}`}
              >
                <PersonPortrait
                  alt={labels.photoAlt(person.displayName)}
                  person={person}
                  sizes="(max-width: 639px) 100vw, (max-width: 1279px) 50vw, 33vw"
                />
                <span className="absolute top-3 right-3 grid size-10 place-items-center rounded-control bg-background/90 text-primary backdrop-blur-sm transition-transform duration-200 group-hover:-translate-y-0.5 group-hover:translate-x-0.5 motion-reduce:transform-none">
                  <ArrowUpRightIcon aria-hidden="true" className="size-4" />
                </span>
              </Link>
              <div className="grid gap-2 border-t border-border pt-4">
                <Badge className="w-fit" variant="secondary">
                  {labels.entryYear(person.entryYear)}
                </Badge>
                <h2 className="text-2xl leading-snug font-semibold text-balance">
                  <Link
                    className="transition-colors duration-150 group-hover:text-primary focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary"
                    href={`/people/${person.publicId}`}
                  >
                    {person.displayName}
                  </Link>
                </h2>
                <p className="text-sm font-medium text-muted-foreground tabular-nums">
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
