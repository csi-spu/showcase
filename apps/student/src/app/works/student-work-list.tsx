'use client';

import { Button, buttonVariants } from '@showcase/ui/button';
import Image from 'next/image';
import Link from 'next/link';
import { useTransition } from 'react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import type { WorkListItem } from '@/lib/student-works-core';
import { archiveSavedDraftAction, restoreSavedDraftAction } from './work.actions';

export function StudentWorkList({
  canEdit,
  items,
  labels,
  visitorUrl = '',
}: {
  canEdit: boolean;
  items: WorkListItem[];
  labels: Record<string, string>;
  visitorUrl?: string;
}) {
  return (
    <ul className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
      {items.map((work) => (
        <li aria-label={work.title ?? labels.placeholder} key={work.publicId}>
          <Card className="h-full overflow-hidden">
            {work.poster === null ? (
              <div className="aspect-[3/4] bg-muted" aria-label={labels.posterFallback} />
            ) : (
              <Image
                alt=""
                className="aspect-[3/4] w-full object-cover"
                height={work.poster.height}
                loading="lazy"
                sizes="(max-width: 640px) 100vw, (max-width: 1280px) 50vw, 33vw"
                src={`/works/${work.publicId}/media/${work.poster.assetId}/${work.poster.variants.at(-1)?.width ?? work.poster.width}`}
                unoptimized
                width={work.poster.width}
              />
            )}
            <CardHeader>
              <div className="flex flex-wrap gap-2">
                <Badge>{labels[`source.${work.displayedSource}`]}</Badge>
                <Badge variant="outline">{labels[`activity.${work.activityState}`]}</Badge>
                <Badge variant="outline">{labels[`publication.${work.publicationState}`]}</Badge>
                <Badge variant="secondary">
                  {
                    labels[
                      `review.${work.latestRevisionStatus ?? (work.hasDraft ? 'draft' : 'none')}`
                    ]
                  }
                </Badge>
              </div>
              <CardTitle>
                <h2>{work.title ?? labels.placeholder}</h2>
              </CardTitle>
            </CardHeader>
            <CardContent className="grid gap-2">
              <p className="line-clamp-3 text-sm text-muted-foreground">
                {work.summary ?? labels.placeholder}
              </p>
              <p className="text-xs text-muted-foreground">
                {labels.updatedAt} {formatBangkokDate(work.updatedAt)}
              </p>
            </CardContent>
            <CardFooter className="flex flex-wrap gap-2">
              {primaryAction(work, canEdit, labels, visitorUrl)}
              {canEdit ? <SecondaryActions labels={labels} work={work} /> : null}
            </CardFooter>
          </Card>
        </li>
      ))}
    </ul>
  );
}

function primaryAction(
  work: WorkListItem,
  canEdit: boolean,
  labels: Record<string, string>,
  visitorUrl: string,
) {
  if (
    work.primaryAction === null ||
    (!canEdit && work.primaryAction !== 'view_details' && work.primaryAction !== 'view_public_work')
  )
    return null;
  const href =
    work.primaryAction === 'view_public_work'
      ? `${visitorUrl}/works/${work.publicId}`
      : `/works/${work.publicId}`;
  return (
    <Link className={buttonVariants()} href={href}>
      {labels[`actions.${work.primaryAction}`]}
    </Link>
  );
}

function SecondaryActions({
  labels,
  work,
}: {
  labels: Record<string, string>;
  work: WorkListItem;
}) {
  const [pending, start] = useTransition();
  if (work.secondaryActions.length === 0 && work.primaryAction !== 'return_to_editing') return null;
  return (
    <details>
      <summary className={buttonVariants({ variant: 'outline' })}>{labels.more}</summary>
      <div className="mt-2 grid gap-2 rounded-control border bg-card p-2">
        {work.primaryAction === 'return_to_editing' ? (
          <Button
            disabled={pending}
            onClick={() =>
              start(async () => {
                await restoreSavedDraftAction({
                  expectedVersion: work.version,
                  idempotencyKey: crypto.randomUUID(),
                  publicId: work.publicId,
                });
                window.location.reload();
              })
            }
            type="button"
            variant="outline"
          >
            {labels['actions.return_to_editing']}
          </Button>
        ) : null}
        {work.secondaryActions.map((action) =>
          action === 'archive_saved_draft' ? (
            <Button
              disabled={pending}
              key={action}
              onClick={() => {
                if (window.confirm(labels.archiveConfirm))
                  start(async () => {
                    await archiveSavedDraftAction({
                      confirmation: true,
                      expectedVersion: work.version,
                      idempotencyKey: crypto.randomUUID(),
                      publicId: work.publicId,
                    });
                    window.location.reload();
                  });
              }}
              type="button"
              variant="outline"
            >
              {labels[`actions.${action}`]}
            </Button>
          ) : (
            <Link
              className={buttonVariants({ variant: 'outline' })}
              href={`/works/${work.publicId}`}
              key={action}
            >
              {labels[`actions.${action}`]}
            </Link>
          ),
        )}
      </div>
    </details>
  );
}

function formatBangkokDate(value: string) {
  return new Intl.DateTimeFormat('th-TH', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Asia/Bangkok',
  }).format(new Date(value));
}
