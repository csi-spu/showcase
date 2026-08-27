import Image from 'next/image';
import Link from 'next/link';
import { ArrowUpRightIcon } from 'lucide-react';
import { cn } from '@showcase/ui/cn';
import { Badge } from '@/components/ui/badge';
import { BlurFade } from '@/components/ui/blur-fade';
import type { WorkCatalogCard } from '@/lib/public-catalog-core';
import { CatalogEmptyState, WorkPosterFallback } from '../catalog-artwork';

interface CatalogWorkGridLabels {
  empty: string;
  openWork?: string;
  posterAlt(title: string): string;
}

export function CatalogWorkGrid({
  isHomepage = false,
  labels,
  works,
}: {
  isHomepage?: boolean;
  labels: CatalogWorkGridLabels;
  works: WorkCatalogCard[];
}) {
  if (works.length === 0) {
    return <CatalogEmptyState message={labels.empty} />;
  }

  return (
    <ol
      className={cn(
        'grid list-none gap-x-6 gap-y-12 p-0 md:grid-cols-2',
        isHomepage ? 'xl:grid-cols-12' : 'xl:grid-cols-3',
      )}
    >
      {works.map((work, index) => (
        <li
          className={cn(isHomepage && (index % 2 === 0 ? 'xl:col-span-7' : 'xl:col-span-5'))}
          key={work.workPublicId}
        >
          <BlurFade blur="5px" delay={Math.min(index, 5) * 0.06} duration={0.4} inView>
            <article className="group grid gap-5 transition-transform duration-300 hover:-translate-y-1 motion-reduce:transition-none motion-reduce:transform-none">
              <Link
                className="relative block overflow-hidden rounded-media focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary"
                href={`/works/${work.workPublicId}`}
              >
                {work.poster === null ? (
                  <div className="relative aspect-[3/4] border border-border bg-muted">
                    <WorkPosterFallback title={work.title} variant={index % 3} />
                  </div>
                ) : (
                  <CatalogPoster
                    alt={labels.posterAlt(work.title)}
                    isPriority={isHomepage && index === 0}
                    poster={work.poster}
                    workPublicId={work.workPublicId}
                  />
                )}
              </Link>
              <div className="grid gap-3 border-t border-border pt-4">
                <div className="flex items-center justify-between gap-4">
                  <Badge variant="secondary">
                    {work.academicPeriod.year} / {work.academicPeriod.semester}
                  </Badge>
                  {labels.openWork ? (
                    <span className="flex items-center gap-1 text-sm font-medium text-primary">
                      {labels.openWork}
                      <ArrowUpRightIcon
                        aria-hidden="true"
                        className="size-4 transition-transform duration-200 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 motion-reduce:transition-none motion-reduce:transform-none"
                      />
                    </span>
                  ) : null}
                </div>
                <h2 className="text-2xl leading-[1.35] font-semibold text-balance">
                  <Link
                    className="transition-colors duration-150 group-hover:text-primary focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary motion-reduce:transition-none"
                    href={`/works/${work.workPublicId}`}
                  >
                    {work.title}
                  </Link>
                </h2>
                <p className="text-muted-foreground text-pretty">{work.summary}</p>
                <p className="text-sm">{work.attributions.join(', ')}</p>
                {work.tags.length === 0 ? null : (
                  <ul className="flex list-none flex-wrap gap-2 p-0">
                    {work.tags.map((tag) => (
                      <li key={tag.publicId}>
                        <Badge render={<Link href={`/tags/${tag.publicId}`} />} variant="outline">
                          {tag.displayLabel}
                        </Badge>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </article>
          </BlurFade>
        </li>
      ))}
    </ol>
  );
}

function CatalogPoster({
  alt,
  isPriority,
  poster,
  workPublicId,
}: {
  alt: string;
  isPriority: boolean;
  poster: NonNullable<WorkCatalogCard['poster']>;
  workPublicId: string;
}) {
  const largest = poster.variants.at(-1);
  if (largest === undefined) return null;
  const sizes = '(max-width: 767px) 100vw, (max-width: 1199px) 50vw, 33vw';
  return (
    <div
      className="overflow-hidden rounded-media bg-muted transition-shadow duration-300 group-hover:shadow-[0_1.5rem_4rem_-2rem_color-mix(in_oklch,var(--primary),transparent_55%)] motion-reduce:transition-none"
      style={{
        aspectRatio: `${poster.width} / ${poster.height}`,
        backgroundColor: poster.dominantColor,
      }}
    >
      <picture>
        <source
          sizes={sizes}
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
          className="h-auto w-full transition-transform duration-500 ease-out group-hover:scale-[1.035] motion-reduce:transition-none motion-reduce:transform-none"
          height={largest.height}
          loading={isPriority ? undefined : 'lazy'}
          preload={isPriority}
          sizes={sizes}
          src={`/works/${workPublicId}/media/${poster.assetId}/${largest.width}`}
          unoptimized
          width={largest.width}
        />
      </picture>
    </div>
  );
}
