import type { ReactNode } from 'react';
import { ExternalLinkIcon, UserRoundIcon } from 'lucide-react';
import Image from 'next/image';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import type { WorkRevision } from '@/lib/student-works-core';

export interface WorkRevisionDetailsLabels {
  academicPeriod: string;
  academicPeriodLabel: string;
  attributions: string;
  category: string;
  categoryLabel: string;
  description: string;
  discovery: string;
  galleryAlt(index: number): string;
  information: string;
  links: string;
  media: string;
  mediaHelp: string;
  posterAlt: string;
  revision: string;
  revisionLabel: string;
  studyYear(year: number): string;
  submittedAt: string;
  submittedAtLabel: string;
  submitter: string;
  tags: string;
  videos: string;
}

export function WorkRevisionDetails({
  action,
  labels,
  revision,
}: {
  action?: ReactNode;
  labels: WorkRevisionDetailsLabels;
  revision: WorkRevision;
}) {
  const poster = revision.media.find((item) => item.kind === 'poster');
  const gallery = revision.media.filter((item) => item.kind === 'gallery');
  const hasDiscovery = revision.content.links.length > 0 || revision.content.videoLinks.length > 0;

  return (
    <div className="mx-auto grid w-full max-w-6xl gap-6 xl:grid-cols-[minmax(0,1fr)_21rem] xl:items-start">
      <RevisionSidebar action={action} labels={labels} revision={revision} />
      <main className="order-2 grid min-w-0 gap-6 xl:order-none xl:col-start-1 xl:row-start-1">
        {poster === undefined && gallery.length === 0 ? null : (
          <Card>
            <CardHeader className="border-b">
              <CardTitle>
                <h2>{labels.media}</h2>
              </CardTitle>
              <CardDescription>{labels.mediaHelp}</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-12">
              {poster === undefined ? null : (
                <RevisionMediaImage
                  alt={labels.posterAlt}
                  className={gallery.length === 0 ? 'md:col-span-12' : 'md:col-span-7'}
                  media={poster}
                  sizes="(max-width: 768px) 100vw, 58vw"
                  workPublicId={revision.workPublicId}
                />
              )}
              {gallery.length === 0 ? null : (
                <div
                  className={`grid gap-4 ${poster === undefined ? 'md:col-span-12 sm:grid-cols-2' : 'md:col-span-5'}`}
                >
                  {gallery.map((media, index) => (
                    <RevisionMediaImage
                      alt={labels.galleryAlt(index + 1)}
                      key={media.assetId}
                      media={media}
                      sizes="(max-width: 768px) 100vw, 34vw"
                      workPublicId={revision.workPublicId}
                    />
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader className="border-b">
            <CardTitle>
              <h2>{labels.description}</h2>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="max-w-[72ch] whitespace-pre-wrap text-base leading-8 text-pretty">
              {revision.content.description}
            </p>
          </CardContent>
        </Card>

        {hasDiscovery ? (
          <Card>
            <CardHeader className="border-b">
              <CardTitle>
                <h2>{labels.discovery}</h2>
              </CardTitle>
            </CardHeader>
            <CardContent className="grid gap-6 sm:grid-cols-2">
              {revision.content.links.length === 0 ? null : (
                <ResourceList heading={labels.links} links={revision.content.links} />
              )}
              {revision.content.videoLinks.length === 0 ? null : (
                <ResourceList heading={labels.videos} links={revision.content.videoLinks} />
              )}
            </CardContent>
          </Card>
        ) : null}
      </main>
    </div>
  );
}

function RevisionSidebar({
  action,
  labels,
  revision,
}: {
  action?: ReactNode;
  labels: WorkRevisionDetailsLabels;
  revision: WorkRevision;
}) {
  return (
    <aside className="contents xl:sticky xl:top-28 xl:col-start-2 xl:row-start-1 xl:grid xl:gap-6">
      {action === undefined ? null : <div className="order-1 xl:order-none">{action}</div>}
      <Card className="order-3 xl:order-none">
        <CardHeader className="border-b">
          <CardTitle>
            <h2>{labels.information}</h2>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid gap-0">
            <InformationRow label={labels.categoryLabel} value={labels.category} />
            <InformationRow label={labels.academicPeriodLabel} value={labels.academicPeriod} />
            <InformationRow label={labels.revisionLabel} value={labels.revision} />
            <InformationRow label={labels.submittedAtLabel} value={labels.submittedAt} />
          </dl>
        </CardContent>
      </Card>

      <Card className="order-3 xl:order-none">
        <CardHeader className="border-b">
          <CardTitle>
            <h2>{labels.attributions}</h2>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="grid gap-3">
            {revision.attributions.map((attribution, index) => (
              <li
                className="grid grid-cols-[auto_minmax(0,1fr)] gap-3 rounded-control border bg-background p-3"
                key={`${attribution.kind}:${index}:${attribution.attributionName}`}
              >
                <span className="grid size-9 place-items-center rounded-full bg-primary-soft text-primary">
                  <UserRoundIcon aria-hidden="true" className="size-4" />
                </span>
                <div className="min-w-0">
                  <p className="font-medium wrap-break-word">{attribution.attributionName}</p>
                  <p className="text-sm">
                    {attribution.kind === 'submitter'
                      ? labels.submitter
                      : attribution.contributionRole}
                  </p>
                  {attribution.studyYear === null ? null : (
                    <p className="text-sm text-muted-foreground">
                      {labels.studyYear(attribution.studyYear)}
                    </p>
                  )}
                  {attribution.affiliation === null ? null : (
                    <p className="text-sm text-muted-foreground">{attribution.affiliation}</p>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      {revision.content.tags.length === 0 ? null : (
        <Card className="order-3 xl:order-none">
          <CardHeader className="border-b">
            <CardTitle>
              <h2>{labels.tags}</h2>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="flex flex-wrap gap-2" aria-label={labels.tags}>
              {revision.content.tags.map((tag) => (
                <li key={tag.normalizedIdentity}>
                  <Badge variant="outline">#{tag.displayLabel}</Badge>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </aside>
  );
}

function RevisionMediaImage({
  alt,
  className = '',
  media,
  sizes,
  workPublicId,
}: {
  alt: string;
  className?: string;
  media: WorkRevision['media'][number];
  sizes: string;
  workPublicId: string;
}) {
  const variant = media.variants.at(-1);
  if (variant === undefined) return null;
  return (
    <div
      className={`grid place-items-center overflow-hidden rounded-media border bg-muted ${className}`}
      style={{ backgroundColor: media.dominantColor }}
    >
      <Image
        alt={alt}
        className="max-h-[38rem] h-auto w-full object-contain"
        height={variant.height}
        sizes={sizes}
        src={`/works/${workPublicId}/media/${media.assetId}/${variant.width}`}
        unoptimized
        width={variant.width}
      />
    </div>
  );
}

function InformationRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid gap-1 border-b py-3 first:pt-0 last:border-b-0 last:pb-0">
      <dt className="text-xs font-medium tracking-wide text-muted-foreground">{label}</dt>
      <dd className="font-medium">{value}</dd>
    </div>
  );
}

function ResourceList({
  heading,
  links,
}: {
  heading: string;
  links: Array<{ label?: string; provider?: string; url: string }>;
}) {
  return (
    <section className="grid content-start gap-3">
      <h3 className="font-medium">{heading}</h3>
      <ul className="grid gap-2">
        {links.map((link) => (
          <li key={link.url}>
            <a
              className="flex min-h-11 items-center justify-between gap-3 rounded-control border bg-background px-4 py-2 font-medium text-primary hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
              href={link.url}
              rel="noreferrer"
              target="_blank"
            >
              <span className="truncate">{link.label ?? link.provider ?? link.url}</span>
              <ExternalLinkIcon aria-hidden="true" className="size-4 shrink-0" />
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}
