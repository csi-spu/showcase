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
      <section className="grid gap-6 border-t border-border pt-8" aria-labelledby="profile-works">
        <header className="grid gap-3">
          <h2
            className="text-[clamp(2.25rem,4vw,3.75rem)] leading-[1.08] font-semibold tracking-[-0.05em] text-balance"
            id="profile-works"
          >
            {labels.heading}
          </h2>
          <p className="max-w-2xl text-lg leading-relaxed text-muted-foreground text-pretty">
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
