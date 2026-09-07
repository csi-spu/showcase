import Link from 'next/link';
import { ArrowUpRightIcon, UsersRoundIcon } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { BlurFade } from '@/components/ui/blur-fade';
import type { PeopleCatalogCard } from '@/lib/public-catalog-core';
import { CatalogEmptyState, PersonPortrait, personScrimClass } from '../catalog-artwork';

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
    <ol className="grid list-none gap-x-6 gap-y-10 p-0 sm:grid-cols-2 xl:grid-cols-3">
      {people.map((person, index) => {
        const rosterName = `${person.firstName} ${person.lastName}`;
        return (
          <li key={person.publicId}>
            <BlurFade blur="4px" delay={Math.min(index, 5) * 0.06} duration={0.4} inView>
              <article data-person-card-layout="portrait">
                <Link
                  className="group relative block aspect-[4/5] overflow-hidden rounded-media border border-border focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary"
                  href={`/people/${person.publicId}`}
                >
                  <PersonPortrait
                    alt={labels.photoAlt(rosterName)}
                    person={person}
                    sizes="(max-width: 639px) 100vw, (max-width: 1279px) 50vw, 33vw"
                  />
                  <div aria-hidden="true" className={personScrimClass(person)} />
                  <span className="absolute top-3 right-3 grid size-10 place-items-center rounded-control bg-white/15 text-white backdrop-blur-sm transition-transform duration-200 group-hover:-translate-y-0.5 group-hover:translate-x-0.5 motion-reduce:transform-none">
                    <ArrowUpRightIcon aria-hidden="true" className="size-4" />
                  </span>
                  <div className="absolute inset-x-0 bottom-0 grid gap-2 p-4 sm:p-5">
                    <Badge
                      className="w-fit border-white/35 bg-white/15 text-white backdrop-blur-sm"
                      variant="outline"
                    >
                      {labels.entryYear(person.entryYear)}
                    </Badge>
                    <h2 className="line-clamp-2 text-lg leading-snug font-semibold text-balance text-white [text-shadow:0_1px_6px_rgb(0_0_0_/_60%)]">
                      {rosterName}
                    </h2>
                    <p className="text-sm font-medium text-white/85 tabular-nums [text-shadow:0_1px_4px_rgb(0_0_0_/_60%)]">
                      {labels.publishedWorks(person.publishedWorkCount)}
                    </p>
                  </div>
                </Link>
              </article>
            </BlurFade>
          </li>
        );
      })}
    </ol>
  );
}
