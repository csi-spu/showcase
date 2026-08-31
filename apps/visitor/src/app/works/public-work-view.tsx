import { cn } from '@showcase/ui/cn';
import Image from 'next/image';
import Link from 'next/link';
import { ArrowUpRightIcon, UserRoundIcon } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { PublicWork } from '@/lib/public-work-core';
import { WorkPosterFallback } from '../catalog-artwork';
import { VideoEmbed } from '../video-embed';
import { requestAttributionRemovalAction } from './[publicId]/attribution-removal.actions';
import { AttributionRemovalForm } from './[publicId]/attribution-removal-form';

interface PublicWorkLabels {
  academicPeriod: string;
  academicPeriodLabel: string;
  attributions: string;
  category: string;
  categoryLabel: string;
  description: string;
  galleryAlt(index: number): string;
  information: string;
  links: string;
  media: string;
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
    <div className="mx-auto grid w-full max-w-6xl gap-6">
      <header className="grid max-w-4xl gap-3">
        <p className="text-sm font-semibold tracking-[0.16em] text-primary">{labels.category}</p>
        <h1 className="text-[clamp(2rem,4vw,3.25rem)] leading-[1.12] font-semibold tracking-[-0.035em] text-balance">
          {work.title}
        </h1>
        <p className="max-w-2xl text-lg leading-relaxed text-muted-foreground text-pretty">
          {work.summary}
        </p>
      </header>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_21rem] xl:items-start">
        <main className="grid min-w-0 gap-6">
          <Card>
            <CardHeader className="border-b">
              <CardTitle>
                <h2>{labels.media}</h2>
              </CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-12">
              {poster ? (
                <MediaImage
                  alt={labels.posterAlt}
                  className={gallery.length === 0 ? 'md:col-span-12' : 'md:col-span-7'}
                  media={poster}
                  sizes="(max-width: 768px) 100vw, 58vw"
                  workPublicId={work.workPublicId}
                />
              ) : (
                <div
                  className={cn(
                    'group relative aspect-[3/4] overflow-hidden rounded-media border border-border',
                    gallery.length === 0 ? 'md:col-span-12' : 'md:col-span-7',
                  )}
                  data-poster-fallback="true"
                >
                  <WorkPosterFallback title={work.title} variant={0} />
                  <p className="absolute inset-x-4 bottom-4 rounded-control border border-border bg-background/85 px-4 py-3 text-center font-medium text-muted-foreground backdrop-blur-sm">
                    {labels.missingPoster}
                  </p>
                </div>
              )}
              {gallery.length === 0 ? null : (
                <div
                  className={cn(
                    'grid gap-4',
                    poster ? 'md:col-span-5' : 'md:col-span-12 sm:grid-cols-2',
                  )}
                >
                  {gallery.map((media, index) => (
                    <MediaImage
                      alt={labels.galleryAlt(index + 1)}
                      key={media.assetId}
                      media={media}
                      sizes="(max-width: 768px) 100vw, 34vw"
                      workPublicId={work.workPublicId}
                    />
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="border-b">
              <CardTitle>
                <h2>{labels.description}</h2>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="max-w-[72ch] whitespace-pre-wrap text-base leading-8 text-pretty">
                {work.description}
              </p>
            </CardContent>
          </Card>

          {work.videoLinks.length === 0 ? null : (
            <Card>
              <CardHeader className="border-b">
                <CardTitle>
                  <h2>{labels.videos}</h2>
                </CardTitle>
              </CardHeader>
              <CardContent className="grid gap-4 sm:grid-cols-2">
                {work.videoLinks.map((video, index) => (
                  <VideoEmbed
                    key={`${video.provider}-${video.providerVideoId}`}
                    title={labels.videoAlt(index + 1)}
                    video={video}
                  />
                ))}
              </CardContent>
            </Card>
          )}

          {work.links.length === 0 ? null : (
            <Card>
              <CardHeader className="border-b">
                <CardTitle>
                  <h2>{labels.links}</h2>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <LinkList links={work.links} />
              </CardContent>
            </Card>
          )}
        </main>

        <aside className="grid gap-6 xl:sticky xl:top-24">
          <Card>
            <CardHeader className="border-b">
              <CardTitle>
                <h2>{labels.information}</h2>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="grid gap-0">
                <InformationRow label={labels.categoryLabel} value={labels.category} />
                <InformationRow label={labels.academicPeriodLabel} value={labels.academicPeriod} />
                <InformationRow label={labels.publishedAtLabel} value={labels.publishedAt} />
              </dl>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="border-b">
              <CardTitle>
                <h2>{labels.attributions}</h2>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {work.attributions.length > 0 ? (
                <ul className="grid gap-3">
                  {work.attributions.map((attribution, index) => (
                    <li
                      className="grid grid-cols-[auto_minmax(0,1fr)] gap-3 rounded-control border border-border bg-background p-3"
                      key={`${index}:${attribution.attributionName}`}
                    >
                      <span className="grid size-9 place-items-center rounded-full bg-primary-soft text-primary">
                        <UserRoundIcon aria-hidden="true" className="size-4" />
                      </span>
                      <div className="min-w-0">
                        {attribution.profilePublicId === null ? (
                          <p className="font-medium wrap-break-word">
                            {attribution.attributionName}
                          </p>
                        ) : (
                          <Link
                            className="font-medium text-primary underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary"
                            href={`/people/${attribution.profilePublicId}`}
                          >
                            {attribution.attributionName}
                          </Link>
                        )}
                        {attribution.contributionRole ? (
                          <p className="text-sm">{attribution.contributionRole}</p>
                        ) : null}
                        {attribution.studyYear === null ? null : (
                          <p className="text-sm text-muted-foreground">
                            {labels.studyYear(attribution.studyYear)}
                          </p>
                        )}
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
                <p className="text-muted-foreground">{labels.missingAttributions}</p>
              )}
            </CardContent>
          </Card>

          {work.tags.length === 0 ? null : (
            <Card>
              <CardHeader className="border-b">
                <CardTitle>
                  <h2>{labels.tagsLabel}</h2>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="flex flex-wrap gap-2">
                  {work.tags.map((tag) => (
                    <li key={tag.publicId}>
                      <Badge render={<Link href={`/tags/${tag.publicId}`} />} variant="outline">
                        {tag.displayLabel}
                      </Badge>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}
        </aside>
      </div>
    </div>
  );
}

function MediaImage({
  alt,
  className = '',
  media,
  sizes,
  workPublicId,
}: {
  alt: string;
  className?: string;
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
      className={cn(
        'grid place-items-center overflow-hidden rounded-media border border-border bg-muted',
        className,
      )}
      style={{ backgroundColor: media.dominantColor }}
    >
      <picture>
        <source sizes={sizes} srcSet={srcSet} type="image/webp" />
        <Image
          alt={alt}
          className="h-auto max-h-[38rem] w-full object-contain"
          height={variant.height}
          sizes={sizes}
          src={source}
          unoptimized
          width={variant.width}
        />
      </picture>
    </div>
  );
}

function InformationRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid gap-1 border-b border-border py-3 first:pt-0 last:border-b-0 last:pb-0">
      <dt className="text-xs font-medium tracking-wide text-muted-foreground">{label}</dt>
      <dd className="font-medium">{value}</dd>
    </div>
  );
}

function LinkList({ links }: { links: Array<{ label: string; url: string }> }) {
  return (
    <ul className="grid gap-2 sm:grid-cols-2">
      {links.map((link) => (
        <li key={link.url}>
          <a
            className="flex min-h-11 items-center justify-between gap-3 rounded-control border border-border bg-background px-4 py-2 font-medium text-primary hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
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
