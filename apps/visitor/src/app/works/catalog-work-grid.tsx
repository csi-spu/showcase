import Image from 'next/image';
import Link from 'next/link';
import { ArrowUpRightIcon } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { BlurFade } from '@/components/ui/blur-fade';
import type { WorkCatalogCard } from '@/lib/public-catalog-core';
import { CARD_SCRIM_CLASS, CatalogEmptyState, WorkPosterFallback } from '../catalog-artwork';

interface CatalogWorkGridLabels {
  empty: string;
  posterAlt(title: string): string;
}

export function CatalogWorkGrid({
  labels,
  works,
}: {
  labels: CatalogWorkGridLabels;
  works: WorkCatalogCard[];
}) {
  if (works.length === 0) {
    return <CatalogEmptyState message={labels.empty} />;
  }

  return (
    <ol className="grid list-none gap-x-6 gap-y-10 p-0 md:grid-cols-2 xl:grid-cols-3">
      {works.map((work, index) => (
        <li key={work.workPublicId}>
          <BlurFade blur="5px" delay={Math.min(index, 5) * 0.06} duration={0.4} inView>
            <article data-work-card-layout="poster">
              <Link
                className="group relative block aspect-[3/4] overflow-hidden rounded-media border border-border focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary"
                href={`/works/${work.workPublicId}`}
              >
                {work.poster === null ? (
                  <WorkPosterFallback title={work.title} variant={index % 3} />
                ) : (
                  <CatalogPoster
                    alt={labels.posterAlt(work.title)}
                    isPriority={index === 0}
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
                  <h2 className="line-clamp-2 text-xl leading-snug font-semibold text-balance text-white [text-shadow:0_1px_6px_rgb(0_0_0_/_60%)]">
                    {work.title}
                  </h2>
                  <p className="line-clamp-2 text-sm leading-relaxed text-white/85 text-pretty [text-shadow:0_1px_4px_rgb(0_0_0_/_60%)]">
                    {work.summary}
                  </p>
                </div>
              </Link>
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
    <div className="absolute inset-0" style={{ backgroundColor: poster.dominantColor }}>
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
          className="h-full w-full object-cover transition-transform duration-500 ease-out group-hover:scale-[1.035] motion-reduce:transition-none motion-reduce:transform-none"
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
