import Image from 'next/image';
import Link from 'next/link';
import type { WorkCatalogCard } from '@/lib/public-catalog-core';

interface CatalogWorkGridLabels {
  empty: string;
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
    return <p className="border-t border-border py-12 text-muted-foreground">{labels.empty}</p>;
  }

  return (
    <ol className="grid list-none gap-x-6 gap-y-12 p-0 md:grid-cols-2 xl:grid-cols-3">
      {works.map((work, index) => (
        <li key={work.workPublicId}>
          <article className="grid gap-4">
            {work.poster === null ? null : (
              <CatalogPoster
                alt={labels.posterAlt(work.title)}
                isPriority={isHomepage && index === 0}
                poster={work.poster}
                workPublicId={work.workPublicId}
              />
            )}
            <div className="grid gap-3">
              <p className="text-sm text-muted-foreground">
                {work.academicPeriod.year} / {work.academicPeriod.semester}
              </p>
              <h2 className="text-2xl leading-[1.35] font-semibold">
                <Link
                  className="focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary"
                  href={`/works/${work.workPublicId}`}
                >
                  {work.title}
                </Link>
              </h2>
              <p className="text-muted-foreground">{work.summary}</p>
              <p className="text-sm">{work.attributions.join(', ')}</p>
              {work.tags.length === 0 ? null : (
                <ul className="flex list-none flex-wrap gap-2 p-0">
                  {work.tags.map((tag) => (
                    <li key={tag.publicId}>
                      <Link
                        className="rounded-full bg-primary-soft px-3 py-1 text-sm text-primary"
                        href={`/tags/${tag.publicId}`}
                      >
                        {tag.displayLabel}
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </article>
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
      className="overflow-hidden rounded-media bg-muted"
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
          className="h-auto w-full"
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
