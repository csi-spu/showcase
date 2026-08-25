'use client';

import Image from 'next/image';
import type { AdminReviewRevision } from '@/lib/admin-reviews-core';

interface RevisionSnapshotLabels {
  academicPeriod: string;
  attributions: string;
  category: string;
  categoryValue: string;
  content: string;
  gallery: string;
  links: string;
  media: string;
  poster: string;
  tags: string;
  videos: string;
}

export function RevisionSnapshot({
  labels,
  revision,
}: {
  labels: RevisionSnapshotLabels;
  revision: AdminReviewRevision;
}) {
  return (
    <article className="grid gap-6 xl:col-span-7">
      <section className="rounded-surface border border-border bg-card p-6">
        <h2 className="text-xl font-semibold">{labels.content}</h2>
        <p className="mt-4 font-medium">{revision.content.summary}</p>
        <p className="mt-4 whitespace-pre-wrap text-muted-foreground">
          {revision.content.description}
        </p>
        <div className="mt-6 grid gap-3 text-sm sm:grid-cols-2">
          <Metadata label={labels.category} value={labels.categoryValue} />
          <p className="rounded-control bg-muted p-3 font-medium">{labels.academicPeriod}</p>
        </div>
      </section>

      {revision.content.links.length > 0 ? (
        <SnapshotList heading={labels.links}>
          {revision.content.links.map((link) => (
            <li className="border-t border-border pt-3" key={link.url}>
              <a
                className="font-medium text-primary underline"
                href={link.url}
                rel="noreferrer"
                target="_blank"
              >
                {link.label}
              </a>
            </li>
          ))}
        </SnapshotList>
      ) : null}

      {revision.content.tags.length > 0 ? (
        <section className="rounded-surface border border-border bg-card p-6">
          <h2 className="text-xl font-semibold">{labels.tags}</h2>
          <ul className="mt-4 flex flex-wrap gap-2">
            {revision.content.tags.map((tag) => (
              <li
                className="rounded-full border border-border bg-muted px-3 py-1 text-sm"
                key={tag.normalizedIdentity}
              >
                {tag.displayLabel}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {revision.content.videoLinks.length > 0 ? (
        <SnapshotList heading={labels.videos}>
          {revision.content.videoLinks.map((video) => (
            <li
              className="border-t border-border pt-3"
              key={`${video.provider}-${video.providerVideoId}`}
            >
              <a
                className="font-medium text-primary underline"
                href={video.url}
                rel="noreferrer"
                target="_blank"
              >
                {video.provider === 'youtube' ? 'YouTube' : 'TikTok'}
              </a>
            </li>
          ))}
        </SnapshotList>
      ) : null}

      <SnapshotList heading={labels.media}>
        {revision.media.map((media) => (
          <li className="border-t border-border pt-3" key={media.assetId}>
            <p className="mb-3 text-sm font-medium">
              {media.kind === 'poster' ? labels.poster : `${labels.gallery} ${media.position}`}{' '}
              {media.width.toLocaleString('th-TH')}×{media.height.toLocaleString('th-TH')}
            </p>
            <div className="overflow-hidden rounded-media border border-border bg-muted">
              <Image
                alt={
                  media.kind === 'poster' ? labels.poster : `${labels.gallery} ${media.position}`
                }
                className="h-auto w-full object-contain"
                height={media.height}
                loader={({ src }) => src}
                sizes="(max-width: 1280px) calc(100vw - 64px), 720px"
                src={media.preview.url}
                unoptimized
                width={media.width}
              />
            </div>
          </li>
        ))}
      </SnapshotList>

      <SnapshotList heading={labels.attributions}>
        {revision.attributions.map((attribution, index) => (
          <li className="border-t border-border pt-3" key={`${attribution.kind}-${index}`}>
            <p className="font-medium">{attribution.attributionName}</p>
            {attribution.contributionRole !== null ? (
              <p className="text-sm text-muted-foreground">{attribution.contributionRole}</p>
            ) : null}
          </li>
        ))}
      </SnapshotList>
    </article>
  );
}

function Metadata({ label, value }: { label: string; value: string }) {
  return (
    <dl className="rounded-control bg-muted p-3">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="mt-1 font-medium">{value}</dd>
    </dl>
  );
}

function SnapshotList({ children, heading }: { children: React.ReactNode; heading: string }) {
  return (
    <section className="rounded-surface border border-border bg-card p-6">
      <h2 className="text-xl font-semibold">{heading}</h2>
      <ul className="mt-4 grid gap-3">{children}</ul>
    </section>
  );
}
