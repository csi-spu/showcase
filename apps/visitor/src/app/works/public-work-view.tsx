import Image from 'next/image';
import Link from 'next/link';
import { ArrowUpRightIcon } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import type { PublicWork } from '@/lib/public-work-core';

interface PublicWorkLabels {
  academicPeriod: string;
  attributions: string;
  category: string;
  description: string;
  gallery: string;
  galleryAlt(index: number): string;
  links: string;
  posterAlt: string;
  publishedAt: string;
  studyYear(year: number): string;
  tagsLabel: string;
  videos: string;
}

export function PublicWorkView({ labels, work }: { labels: PublicWorkLabels; work: PublicWork }) {
  const poster = work.media.find((media) => media.kind === 'poster');
  const gallery = work.media.filter((media) => media.kind === 'gallery');

  return (
    <article className="grid gap-12 lg:grid-cols-12 lg:gap-x-16 lg:gap-y-20">
      <header className="grid content-center gap-5 lg:col-span-7 lg:py-10">
        <p className="text-sm font-semibold tracking-[0.12em] text-primary">{labels.category}</p>
        <h1 className="text-[clamp(2.6rem,6vw,5rem)] leading-[1.08] font-semibold tracking-[-0.05em] text-balance">
          {work.title}
        </h1>
        <p className="max-w-2xl text-xl leading-[1.7] text-muted-foreground text-pretty">
          {work.summary}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="secondary">{labels.academicPeriod}</Badge>
          <span className="text-sm text-muted-foreground">{labels.publishedAt}</span>
        </div>
        {work.tags.length > 0 ? (
          <ul className="flex flex-wrap gap-2" aria-label={labels.tagsLabel}>
            {work.tags.map((tag) => (
              <li key={tag.publicId}>
                <Badge render={<Link href={`/tags/${tag.publicId}`} />} variant="outline">
                  {tag.displayLabel}
                </Badge>
              </li>
            ))}
          </ul>
        ) : null}
      </header>

      {poster ? (
        <MediaImage
          alt={labels.posterAlt}
          className="shadow-[0_2rem_5rem_-3rem_color-mix(in_oklch,var(--primary),transparent_48%)] lg:col-span-5 lg:row-span-2"
          media={poster}
          sizes="(max-width: 1024px) 100vw, 42vw"
          workPublicId={work.workPublicId}
        />
      ) : null}

      <section className="grid gap-6 border-t border-border pt-8 lg:col-span-7">
        <h2 className="text-3xl font-semibold tracking-[-0.03em]">{labels.description}</h2>
        <p className="max-w-[65ch] whitespace-pre-wrap text-lg leading-[1.85] text-pretty">
          {work.description}
        </p>
      </section>

      <section className="grid gap-5 border-t border-border pt-8 lg:col-span-7">
        <h2 className="text-3xl font-semibold tracking-[-0.03em]">{labels.attributions}</h2>
        <ul className="grid gap-4 sm:grid-cols-2">
          {work.attributions.map((attribution, index) => (
            <li
              className="rounded-surface border border-border bg-card p-5 shadow-[0_1rem_2.5rem_-2rem_color-mix(in_oklch,var(--primary),transparent_70%)]"
              key={`${index}:${attribution.attributionName}`}
            >
              {attribution.profilePublicId === null ? (
                <p className="font-medium">{attribution.attributionName}</p>
              ) : (
                <Link
                  className="font-medium text-primary underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary"
                  href={`/people/${attribution.profilePublicId}`}
                >
                  {attribution.attributionName}
                </Link>
              )}
              {attribution.studyYear === null ? null : (
                <p className="text-sm text-muted-foreground">
                  {labels.studyYear(attribution.studyYear)}
                </p>
              )}
              {attribution.contributionRole ? <p>{attribution.contributionRole}</p> : null}
              {attribution.affiliation ? (
                <p className="text-sm text-muted-foreground">{attribution.affiliation}</p>
              ) : null}
            </li>
          ))}
        </ul>
      </section>

      {gallery.length > 0 ? (
        <section className="grid gap-5 border-t border-border pt-8 lg:col-span-12">
          <h2 className="text-3xl font-semibold tracking-[-0.03em]">{labels.gallery}</h2>
          <div className="grid gap-6 md:grid-cols-12">
            {gallery.map((media, index) => (
              <MediaImage
                alt={labels.galleryAlt(index + 1)}
                className={index === 0 ? 'md:col-span-7' : 'md:col-span-5'}
                key={media.assetId}
                media={media}
                sizes="(max-width: 768px) 100vw, 33vw"
                workPublicId={work.workPublicId}
              />
            ))}
          </div>
        </section>
      ) : null}

      {work.links.length > 0 ? <LinkList heading={labels.links} links={work.links} /> : null}
      {work.videoLinks.length > 0 ? (
        <LinkList heading={labels.videos} links={work.videoLinks} />
      ) : null}
    </article>
  );
}

function MediaImage({
  alt,
  className,
  media,
  sizes,
  workPublicId,
}: {
  alt: string;
  className: string;
  media: PublicWork['media'][number];
  sizes: string;
  workPublicId: string;
}) {
  const variant = media.variants.at(-1);
  if (variant === undefined) return null;
  return (
    <div
      className={`overflow-hidden rounded-media bg-muted ${className}`}
      style={{ backgroundColor: media.dominantColor }}
    >
      <picture>
        <source
          sizes={sizes}
          srcSet={media.variants
            .map(
              (candidate) =>
                `/works/${workPublicId}/media/${media.assetId}/${candidate.width} ${candidate.width}w`,
            )
            .join(', ')}
          type="image/webp"
        />
        <Image
          alt={alt}
          className="h-auto w-full"
          height={variant.height}
          sizes={sizes}
          src={`/works/${workPublicId}/media/${media.assetId}/${variant.width}`}
          unoptimized
          width={variant.width}
        />
      </picture>
    </div>
  );
}

function LinkList({
  heading,
  links,
}: {
  heading: string;
  links: Array<{ label?: string; provider?: string; url: string }>;
}) {
  return (
    <section className="grid gap-4 border-t border-border pt-8 lg:col-span-6">
      <h2 className="text-3xl font-semibold tracking-[-0.03em]">{heading}</h2>
      <ul className="grid gap-3">
        {links.map((link) => (
          <li key={link.url}>
            <a
              className="group flex min-h-12 items-center justify-between gap-3 border-b border-border font-medium text-primary transition-colors duration-200 hover:border-primary focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary"
              href={link.url}
              rel="external noopener noreferrer"
            >
              {link.label ?? link.provider}
              <ArrowUpRightIcon
                aria-hidden="true"
                className="size-4 transition-transform duration-200 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 motion-reduce:transform-none"
              />
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}
