import { cn } from '@showcase/ui/cn';
import Image from 'next/image';
import Link from 'next/link';
import { ArrowUpRightIcon, UserRoundIcon } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { BlurFade } from '@/components/ui/blur-fade';
import { InteractiveGridPattern } from '@/components/ui/interactive-grid-pattern';
import type { PublicWork } from '@/lib/public-work-core';
import { WorkPosterFallback } from '../catalog-artwork';
import { requestAttributionRemovalAction } from './[publicId]/attribution-removal.actions';
import { AttributionRemovalForm } from './[publicId]/attribution-removal-form';

interface PublicWorkLabels {
  academicPeriod: string;
  attributions: string;
  category: string;
  description: string;
  gallery: string;
  galleryAlt(index: number): string;
  links: string;
  missingAttributions: string;
  missingPoster: string;
  posterAlt: string;
  publishedAt: string;
  removal: Record<
    | 'heading'
    | 'help'
    | 'invalid'
    | 'rateLimited'
    | 'reason'
    | 'received'
    | 'submit'
    | 'unavailable',
    string
  >;
  studyYear(year: number): string;
  tagsLabel: string;
  videos: string;
}

export function PublicWorkView({ labels, work }: { labels: PublicWorkLabels; work: PublicWork }) {
  const poster = work.media.find((media) => media.kind === 'poster');
  const gallery = work.media.filter((media) => media.kind === 'gallery');

  return (
    <article className="grid gap-8 lg:gap-12">
      <BlurFade blur="8px" duration={0.45}>
        <section className="relative isolate grid overflow-hidden rounded-media border border-border bg-card shadow-[0_2rem_5rem_-3rem_color-mix(in_oklch,var(--primary),transparent_50%)] lg:grid-cols-12">
          <InteractiveGridPattern
            aria-hidden="true"
            className="pointer-events-none absolute inset-y-0 right-0 left-auto -z-10 h-full w-4/5 border-0 opacity-55 [mask-image:linear-gradient(to_left,black,transparent_88%)]"
            squares={[16, 14]}
            squaresClassName="stroke-primary/10"
            tabIndex={-1}
          />
          <header className="grid content-center gap-5 px-5 py-10 sm:px-8 sm:py-12 lg:col-span-7 lg:px-12 lg:py-16">
            <Badge className="w-fit" variant="outline">
              {labels.category}
            </Badge>
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

          <div className="relative min-h-[32rem] overflow-hidden border-t border-border bg-muted lg:col-span-5 lg:min-h-[42rem] lg:border-t-0 lg:border-l">
            {poster ? (
              <MediaImage
                alt={labels.posterAlt}
                className="absolute inset-0 size-full"
                fill
                media={poster}
                sizes="(max-width: 1024px) 100vw, 42vw"
                workPublicId={work.workPublicId}
              />
            ) : (
              <div className="group absolute inset-0" data-poster-fallback="true">
                <WorkPosterFallback title={work.title} variant={0} />
                <p className="absolute inset-x-6 bottom-6 rounded-control border border-border bg-background/85 px-4 py-3 text-center font-medium text-muted-foreground backdrop-blur-sm">
                  {labels.missingPoster}
                </p>
              </div>
            )}
          </div>
        </section>
      </BlurFade>

      <div className="grid gap-8 lg:grid-cols-12">
        <BlurFade className="lg:col-span-7" blur="5px" duration={0.4} inView>
          <section className="grid h-full gap-6 rounded-media border border-border bg-card p-5 sm:p-8 lg:p-10">
            <h2 className="text-3xl font-semibold tracking-[-0.03em]">{labels.description}</h2>
            <p className="max-w-[65ch] whitespace-pre-wrap text-lg leading-[1.85] text-pretty">
              {work.description}
            </p>
          </section>
        </BlurFade>

        <BlurFade className="lg:col-span-5" blur="5px" delay={0.06} duration={0.4} inView>
          <section className="grid h-full content-start gap-5 rounded-media border border-border bg-card p-5 sm:p-8 lg:p-10">
            <h2 className="text-3xl font-semibold tracking-[-0.03em]">{labels.attributions}</h2>
            {work.attributions.length > 0 ? (
              <ul className="grid gap-3">
                {work.attributions.map((attribution, index) => (
                  <li
                    className="grid grid-cols-[auto_minmax(0,1fr)] gap-3 rounded-control border border-border bg-background p-4"
                    key={`${index}:${attribution.attributionName}`}
                  >
                    <span className="grid size-10 place-items-center rounded-full bg-primary-soft text-primary">
                      <UserRoundIcon aria-hidden="true" className="size-5" />
                    </span>
                    <div className="min-w-0">
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
                      {attribution.canRequestRemoval ? (
                        <AttributionRemovalForm
                          action={requestAttributionRemovalAction.bind(
                            null,
                            work.workPublicId,
                            attribution.attributionPublicId,
                          )}
                          idempotencyKey={crypto.randomUUID()}
                          labels={labels.removal}
                        />
                      ) : null}
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="grid min-h-32 place-items-center rounded-media border border-dashed border-border bg-muted/35 px-5 text-center text-muted-foreground">
                <p>{labels.missingAttributions}</p>
              </div>
            )}
          </section>
        </BlurFade>
      </div>

      {gallery.length > 0 ? (
        <BlurFade blur="5px" duration={0.4} inView>
          <section className="grid gap-6 rounded-media border border-border bg-card p-5 sm:p-8 lg:p-10">
            <h2 className="text-3xl font-semibold tracking-[-0.03em]">{labels.gallery}</h2>
            <div className="grid gap-4 md:grid-cols-12">
              {gallery.map((media, index) => (
                <MediaImage
                  alt={labels.galleryAlt(index + 1)}
                  className={index === 0 ? 'md:col-span-7' : 'md:col-span-5'}
                  key={media.assetId}
                  media={media}
                  sizes="(max-width: 768px) 100vw, 50vw"
                  workPublicId={work.workPublicId}
                />
              ))}
            </div>
          </section>
        </BlurFade>
      ) : null}

      {work.links.length > 0 || work.videoLinks.length > 0 ? (
        <div className="grid gap-8 lg:grid-cols-2">
          {work.links.length > 0 ? <LinkList heading={labels.links} links={work.links} /> : null}
          {work.videoLinks.length > 0 ? (
            <LinkList heading={labels.videos} links={work.videoLinks} />
          ) : null}
        </div>
      ) : null}
    </article>
  );
}

function MediaImage({
  alt,
  className,
  fill = false,
  media,
  sizes,
  workPublicId,
}: {
  alt: string;
  className?: string;
  fill?: boolean;
  media: PublicWork['media'][number];
  sizes: string;
  workPublicId: string;
}) {
  const variant = media.variants.at(-1);
  if (variant === undefined) return null;
  const source = `/works/${workPublicId}/media/${media.assetId}/${variant.width}`;
  const srcSet = media.variants
    .map(
      (candidate) =>
        `/works/${workPublicId}/media/${media.assetId}/${candidate.width} ${candidate.width}w`,
    )
    .join(', ');

  return (
    <div
      className={cn('overflow-hidden rounded-media bg-muted', className)}
      style={{ backgroundColor: media.dominantColor }}
    >
      <picture>
        <source sizes={sizes} srcSet={srcSet} type="image/webp" />
        <Image
          alt={alt}
          className={fill ? 'object-contain' : 'h-auto w-full'}
          {...(fill ? { fill: true } : { height: variant.height, width: variant.width })}
          sizes={sizes}
          src={source}
          unoptimized
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
    <BlurFade blur="5px" duration={0.4} inView>
      <section className="grid gap-4 rounded-media border border-border bg-card p-5 sm:p-8">
        <h2 className="text-3xl font-semibold tracking-[-0.03em]">{heading}</h2>
        <ul className="grid gap-3">
          {links.map((link) => (
            <li key={link.url}>
              <a
                className="group flex min-h-14 items-center justify-between gap-3 rounded-control border border-border bg-background px-4 font-medium text-primary transition-[border-color,transform] duration-200 hover:-translate-y-0.5 hover:border-primary/35 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary motion-reduce:transform-none"
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
    </BlurFade>
  );
}
