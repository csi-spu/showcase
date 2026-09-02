import { cn } from '@showcase/ui/cn';
import Image from 'next/image';
import Link from 'next/link';
import { ArrowUpRightIcon } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { ImageCarousel } from '@/components/ui/image-carousel';
import { InteractiveGridPattern } from '@/components/ui/interactive-grid-pattern';
import type { PublicWork } from '@/lib/public-work-core';
import { WorkPosterFallback } from '../catalog-artwork';
import { VideoEmbed } from '../video-embed';
import { requestAttributionRemovalAction } from './[publicId]/attribution-removal.actions';
import { AttributionRemovalForm } from './[publicId]/attribution-removal-form';
import { AttributionAvatar } from './attribution-avatar';

interface PublicWorkLabels {
  academicPeriod: string;
  attributions: string;
  carouselGoToSlide(index: number): string;
  carouselNext: string;
  carouselPrevious: string;
  category: string;
  description: string;
  galleryAlt(index: number): string;
  imageUnavailable: string;
  links: string;
  missingAttributions: string;
  missingPoster: string;
  posterAlt: string;
  publishedAt: string;
  publishedAtLabel: string;
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
  videoAlt(index: number): string;
  videos: string;
}

export function PublicWorkView({ labels, work }: { labels: PublicWorkLabels; work: PublicWork }) {
  const poster = work.media.find((media) => media.kind === 'poster');
  const gallery = work.media.filter((media) => media.kind === 'gallery');

  return (
    <article className="mx-auto grid w-full max-w-6xl gap-10 lg:gap-14">
      <section className="relative isolate min-h-[28rem] overflow-hidden rounded-media border border-border shadow-[0_2rem_5rem_-2.5rem_color-mix(in_oklch,var(--primary),transparent_60%)] sm:min-h-[32rem] lg:min-h-[38rem]">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 top-0 z-10 h-32 bg-[radial-gradient(120%_100%_at_50%_0%,color-mix(in_oklch,var(--primary),transparent_70%)_0%,transparent_75%)]"
        />
        <div className="absolute inset-0 bg-muted">
          {gallery.length > 0 ? (
            <ImageCarousel
              labels={{
                imageUnavailable: labels.imageUnavailable,
                next: labels.carouselNext,
                previous: labels.carouselPrevious,
              }}
              slides={gallery.flatMap((media, index) => {
                const variant = media.variants.at(-1);
                if (variant === undefined) return [];
                return [
                  {
                    alt: labels.galleryAlt(index + 1),
                    dotLabel: labels.carouselGoToSlide(index + 1),
                    src: `/works/${work.workPublicId}/media/${media.assetId}/${variant.width}`,
                    srcSet: media.variants
                      .map(
                        (candidate) =>
                          `/works/${work.workPublicId}/media/${media.assetId}/${candidate.width} ${candidate.width}w`,
                      )
                      .join(', '),
                  },
                ];
              })}
            />
          ) : (
            <InteractiveGridPattern
              aria-hidden="true"
              className="opacity-70"
              squares={[26, 16]}
              squaresClassName="stroke-primary/15"
              tabIndex={-1}
            />
          )}
        </div>
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_top,rgba(10,8,14,0.9)_0%,rgba(10,8,14,0.55)_45%,rgba(10,8,14,0.2)_100%)]"
        />

        <div className="pointer-events-none relative grid gap-8 p-6 pb-14 sm:p-8 sm:pb-16 lg:grid-cols-12 lg:items-end lg:gap-10 lg:p-12 lg:pb-16">
          <div className="pointer-events-auto relative lg:col-span-4">
            {poster ? (
              <div className="relative isolate">
                <div
                  aria-hidden="true"
                  className="absolute -inset-4 -z-10 rounded-media bg-[radial-gradient(60%_60%_at_50%_40%,color-mix(in_oklch,var(--primary),transparent_45%)_0%,transparent_75%)] blur-xl"
                />
                <PosterFrame
                  alt={labels.posterAlt}
                  media={poster}
                  workPublicId={work.workPublicId}
                />
              </div>
            ) : (
              <div
                className="relative mx-auto aspect-[3/4] w-48 overflow-hidden rounded-media border border-border shadow-[0_1.5rem_4rem_-2rem_rgba(0,0,0,0.55)] sm:w-56 lg:mx-0 lg:w-full lg:max-w-[17rem]"
                data-poster-fallback="true"
              >
                <WorkPosterFallback title={work.title} variant={0} />
                <p className="absolute inset-x-3 bottom-3 rounded-control border border-border bg-background/85 px-3 py-2 text-center text-sm font-medium text-muted-foreground backdrop-blur-sm">
                  {labels.missingPoster}
                </p>
              </div>
            )}
          </div>

          <div className="pointer-events-auto grid content-end gap-4 lg:col-span-8">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-white/80">
              <Badge className="border-primary/40 bg-primary/25 text-white backdrop-blur-sm">
                {labels.category}
              </Badge>
              <span>{labels.academicPeriod}</span>
              <span aria-hidden="true">·</span>
              <span>
                {labels.publishedAtLabel} {labels.publishedAt}
              </span>
            </div>
            <h1 className="text-[clamp(2rem,4vw,3.25rem)] leading-[1.12] font-semibold tracking-[-0.03em] text-balance text-white [text-shadow:0_2px_16px_rgb(0_0_0_/_45%)]">
              {work.title}
            </h1>
            <p className="max-w-2xl text-lg leading-relaxed text-white/85 text-pretty">
              {work.summary}
            </p>
            {work.tags.length === 0 ? null : (
              <ul className="flex flex-wrap gap-2" aria-label={labels.tagsLabel}>
                {work.tags.map((tag) => (
                  <li key={tag.publicId}>
                    <Badge
                      className="border-white/25 bg-white/10 text-white/90 backdrop-blur-sm"
                      render={<Link href={`/tags/${tag.publicId}`} />}
                      variant="outline"
                    >
                      {tag.displayLabel}
                    </Badge>
                  </li>
                ))}
              </ul>
            )}
            {work.attributions.length === 0 ? null : (
              <p className="text-sm text-white/85">
                {labels.attributions}{' '}
                {work.attributions.map((attribution, index) => (
                  <span key={`${index}:${attribution.attributionName}`}>
                    {index > 0 ? ', ' : ''}
                    {attribution.profilePublicId === null ? (
                      attribution.attributionName
                    ) : (
                      <Link
                        className="underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
                        href={`/people/${attribution.profilePublicId}`}
                      >
                        {attribution.attributionName}
                      </Link>
                    )}
                  </span>
                ))}
              </p>
            )}
          </div>
        </div>
      </section>

      <section className="relative isolate grid gap-4 overflow-hidden rounded-media border border-border bg-card p-6 shadow-[0_1.5rem_3rem_-2rem_color-mix(in_oklch,var(--primary),transparent_75%)] sm:p-8">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 top-0 h-24 bg-[radial-gradient(120%_100%_at_0%_0%,color-mix(in_oklch,var(--primary),transparent_88%)_0%,transparent_75%)]"
        />
        <h2 className="relative text-xl font-bold tracking-tight text-primary">
          {labels.attributions}
        </h2>
        {work.attributions.length > 0 ? (
          <ul className="flex flex-wrap justify-center gap-4">
            {work.attributions.map((attribution, index) => (
              <li
                className="group relative isolate grid aspect-square w-[calc(50%-0.5rem)] overflow-hidden rounded-media border border-border bg-muted shadow-[0_1px_2px_rgba(16,12,20,0.04)] transition-[border-color,transform,box-shadow] duration-300 hover:-translate-y-1 hover:border-primary/25 hover:shadow-[0_1.5rem_3rem_-1.75rem_color-mix(in_oklch,var(--primary),transparent_55%)] motion-reduce:transition-none motion-reduce:hover:translate-y-0 sm:w-[calc(33.333%-0.75rem)] lg:w-[calc(25%-0.75rem)] xl:w-[calc(20%-1rem)]"
                key={`${index}:${attribution.attributionName}`}
              >
                <AttributionAvatar attribution={attribution} />
                <div
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_top,rgba(10,8,14,0.92)_0%,rgba(10,8,14,0.5)_50%,rgba(10,8,14,0.05)_75%)]"
                />
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
                <div className="relative grid content-end justify-items-center gap-1.5 p-5 pt-10 text-center">
                  {attribution.profilePublicId === null ? (
                    <p className="text-lg font-semibold break-words text-white [text-shadow:0_1px_8px_rgb(0_0_0_/_45%)]">
                      {attribution.attributionName}
                    </p>
                  ) : (
                    <Link
                      className="text-lg font-semibold break-words text-white underline-offset-4 [text-shadow:0_1px_8px_rgb(0_0_0_/_45%)] hover:underline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white"
                      href={`/people/${attribution.profilePublicId}`}
                    >
                      {attribution.attributionName}
                    </Link>
                  )}
                  {attribution.contributionRole ? (
                    <Badge
                      className="border-white/30 bg-white/10 text-white backdrop-blur-sm"
                      variant="outline"
                    >
                      {attribution.contributionRole}
                    </Badge>
                  ) : null}
                  {attribution.studyYear === null && !attribution.affiliation ? null : (
                    <div className="grid gap-0.5 text-sm text-white/80">
                      {attribution.studyYear === null ? null : (
                        <p>{labels.studyYear(attribution.studyYear)}</p>
                      )}
                      {attribution.affiliation ? <p>{attribution.affiliation}</p> : null}
                    </div>
                  )}
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-muted-foreground">{labels.missingAttributions}</p>
        )}
      </section>

      <div
        className={cn(
          'grid gap-6',
          work.videoLinks.length === 0 ? '' : 'lg:grid-cols-[1fr_auto] lg:items-stretch',
        )}
      >
        <section className="relative isolate grid gap-4 overflow-hidden rounded-media border border-border bg-card p-6 shadow-[0_1.5rem_3rem_-2rem_color-mix(in_oklch,var(--primary),transparent_75%)] sm:p-8">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-0 top-0 h-24 bg-[radial-gradient(120%_100%_at_0%_0%,color-mix(in_oklch,var(--primary),transparent_88%)_0%,transparent_75%)]"
          />
          <h2 className="relative text-xl font-bold tracking-tight text-primary">
            {labels.description}
          </h2>
          <p className="relative whitespace-pre-wrap text-base leading-8 font-medium text-foreground text-pretty">
            {work.description}
          </p>
        </section>

        {work.videoLinks.length === 0 ? null : (
          <section className="relative isolate grid content-center justify-items-center gap-4 overflow-hidden rounded-media border border-border bg-card p-6 shadow-[0_1.5rem_3rem_-2rem_color-mix(in_oklch,var(--primary),transparent_75%)] sm:p-8">
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-x-0 top-0 h-24 bg-[radial-gradient(120%_100%_at_50%_0%,color-mix(in_oklch,var(--primary),transparent_88%)_0%,transparent_75%)]"
            />
            <h2 className="relative text-xl font-bold tracking-tight text-primary">
              {labels.videos}
            </h2>
            <div className="relative flex flex-wrap justify-center gap-6">
              {work.videoLinks.map((video, index) => (
                <VideoEmbed
                  key={`${video.provider}-${video.providerVideoId}`}
                  title={labels.videoAlt(index + 1)}
                  video={video}
                />
              ))}
            </div>
          </section>
        )}
      </div>

      {work.links.length === 0 ? null : (
        <section className="relative isolate grid gap-4 overflow-hidden rounded-media border border-border bg-card p-6 shadow-[0_1.5rem_3rem_-2rem_color-mix(in_oklch,var(--primary),transparent_75%)] sm:p-8">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-0 top-0 h-24 bg-[radial-gradient(120%_100%_at_0%_0%,color-mix(in_oklch,var(--primary),transparent_88%)_0%,transparent_75%)]"
          />
          <h2 className="relative text-xl font-semibold tracking-tight">{labels.links}</h2>
          <div className="relative mx-auto w-full max-w-[68ch]">
            <LinkList links={work.links} />
          </div>
        </section>
      )}
    </article>
  );
}

function PosterFrame({
  alt,
  media,
  workPublicId,
}: {
  alt: string;
  media: PublicWork['media'][number];
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
    <Dialog>
      <DialogTrigger
        className="mx-auto block w-48 cursor-zoom-in overflow-hidden rounded-media border border-white/10 shadow-[0_1.5rem_4rem_-1.5rem_rgba(0,0,0,0.6)] transition-transform duration-200 hover:scale-[1.02] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white sm:w-56 lg:mx-0 lg:w-full lg:max-w-[17rem]"
        style={{
          aspectRatio: `${variant.width} / ${variant.height}`,
          backgroundColor: media.dominantColor,
        }}
      >
        <picture>
          <source sizes="(max-width: 1024px) 40vw, 17rem" srcSet={srcSet} type="image/webp" />
          <Image
            alt={alt}
            className="h-full w-full object-contain"
            height={variant.height}
            sizes="(max-width: 1024px) 40vw, 17rem"
            src={source}
            unoptimized
            width={variant.width}
          />
        </picture>
      </DialogTrigger>
      <DialogContent className="max-w-[calc(100%-2rem)] border-none bg-transparent p-0 shadow-none ring-0 sm:max-w-3xl">
        <DialogTitle className="sr-only">{alt}</DialogTitle>
        <div
          className="overflow-hidden rounded-media"
          style={{ backgroundColor: media.dominantColor }}
        >
          <picture>
            <source sizes="90vw" srcSet={srcSet} type="image/webp" />
            <Image
              alt={alt}
              className="max-h-[85vh] w-full object-contain"
              height={variant.height}
              sizes="90vw"
              src={source}
              unoptimized
              width={variant.width}
            />
          </picture>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function LinkList({ links }: { links: Array<{ label: string; url: string }> }) {
  return (
    <ul className="grid gap-2 sm:grid-cols-2">
      {links.map((link) => (
        <li key={link.url}>
          <a
            className={cn(
              'flex min-h-11 items-center justify-between gap-3 rounded-control border border-border bg-background px-4 py-2 font-medium text-primary transition-[border-color,transform] duration-200 hover:-translate-y-0.5 hover:border-primary/35 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary motion-reduce:transform-none',
            )}
            href={link.url}
            rel="external noopener noreferrer"
          >
            <span className="truncate">{link.label}</span>
            <ArrowUpRightIcon aria-hidden="true" className="size-4 shrink-0" />
          </a>
        </li>
      ))}
    </ul>
  );
}
