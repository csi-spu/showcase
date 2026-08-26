import Image from 'next/image';
import Link from 'next/link';
import type { PublicWork } from '@/lib/public-work-core';

interface PublicWorkLabels {
  academicPeriod: string;
  attributions: string;
  category: string;
  description: string;
  gallery: string;
  links: string;
  posterAlt: string;
  publishedAt: string;
  studyYear(year: number): string;
  videos: string;
}

export function PublicWorkView({ labels, work }: { labels: PublicWorkLabels; work: PublicWork }) {
  const poster = work.media.find((media) => media.kind === 'poster');
  const gallery = work.media.filter((media) => media.kind === 'gallery');

  return (
    <article className="grid gap-12 lg:grid-cols-12 lg:gap-16">
      <header className="grid content-start gap-5 lg:col-span-7 lg:pt-8">
        <p className="text-sm font-semibold tracking-[0.16em] text-primary">
          PUBLISHED REVISION {work.revisionNumber}
        </p>
        <h1 className="text-[clamp(2.5rem,6vw,4.5rem)] leading-[1.15] font-semibold tracking-tight">
          {work.title}
        </h1>
        <p className="max-w-2xl text-xl leading-[1.7] text-muted-foreground">{work.summary}</p>
        <dl className="grid gap-2 text-sm sm:grid-cols-2">
          <div>
            <dt className="sr-only">{labels.category}</dt>
            <dd>{labels.category}</dd>
          </div>
          <div>
            <dt className="sr-only">{labels.academicPeriod}</dt>
            <dd>{labels.academicPeriod}</dd>
          </div>
          <div className="sm:col-span-2">
            <dt className="sr-only">{labels.publishedAt}</dt>
            <dd className="text-muted-foreground">{labels.publishedAt}</dd>
          </div>
        </dl>
        {work.tags.length > 0 ? (
          <ul className="flex flex-wrap gap-2" aria-label="Tags">
            {work.tags.map((tag) => (
              <li
                className="rounded-full bg-primary-soft px-3 py-1 text-sm text-primary"
                key={tag.publicId}
              >
                {tag.displayLabel}
              </li>
            ))}
          </ul>
        ) : null}
      </header>

      {poster ? (
        <MediaImage
          alt={labels.posterAlt}
          className="lg:col-span-5 lg:row-span-2"
          media={poster}
          sizes="(max-width: 1024px) 100vw, 42vw"
          workPublicId={work.workPublicId}
        />
      ) : null}

      <section className="grid gap-6 border-t border-border pt-8 lg:col-span-7">
        <h2 className="text-2xl font-semibold">{labels.description}</h2>
        <p className="whitespace-pre-wrap text-base leading-[1.7]">{work.description}</p>
      </section>

      <section className="grid gap-5 border-t border-border pt-8 lg:col-span-7">
        <h2 className="text-2xl font-semibold">{labels.attributions}</h2>
        <ul className="grid gap-4 sm:grid-cols-2">
          {work.attributions.map((attribution, index) => (
            <li
              className="border-l-2 border-primary pl-4"
              key={`${index}:${attribution.attributionName}`}
            >
              {attribution.profilePublicId === null ? (
                <p className="font-medium">{attribution.attributionName}</p>
              ) : (
                <Link
                  className="font-medium text-primary underline"
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
          <h2 className="text-2xl font-semibold">{labels.gallery}</h2>
          <div className="grid gap-6 md:grid-cols-3">
            {gallery.map((media) => (
              <MediaImage
                alt=""
                className=""
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
      <h2 className="text-2xl font-semibold">{heading}</h2>
      <ul className="grid gap-3">
        {links.map((link) => (
          <li key={link.url}>
            <a
              className="flex min-h-11 items-center border-b border-border font-medium text-primary hover:border-primary focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary"
              href={link.url}
              rel="external noopener noreferrer"
            >
              {link.label ?? link.provider}
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}
