import { BlurFade } from '@/components/ui/blur-fade';
import type { WorkCatalogCard } from '@/lib/public-catalog-core';
import { CatalogWorkGrid } from '../works/catalog-work-grid';

interface PublicProfileWorksLabels {
  description: string;
  empty: string;
  heading: string;
  posterAlt(title: string): string;
}

export function PublicProfileWorks({
  labels,
  works,
}: {
  labels: PublicProfileWorksLabels;
  works: WorkCatalogCard[];
}) {
  return (
    <BlurFade blur="5px" duration={0.4} inView>
      <section
        className="mx-auto grid w-full max-w-6xl gap-6 border-t border-border pt-8"
        aria-labelledby="profile-works"
      >
        <header className="grid gap-1">
          <h2 className="text-2xl font-semibold tracking-tight" id="profile-works">
            {labels.heading}
          </h2>
          <p className="max-w-2xl text-sm text-muted-foreground text-pretty">
            {labels.description}
          </p>
        </header>
        <CatalogWorkGrid
          labels={{ empty: labels.empty, posterAlt: labels.posterAlt }}
          works={works}
        />
      </section>
    </BlurFade>
  );
}
