'use client';

import { Button, buttonVariants } from '@showcase/ui/button';
import { toast } from '@showcase/ui/toast';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { ArrowUpRightIcon, Clock3Icon, EllipsisIcon, ImageOffIcon } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { WorkListItem } from '@/lib/student-works-core';
import {
  archiveSavedDraftAction,
  restoreSavedDraftAction,
  type SavedDraftActionResult,
} from './work.actions';

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
      {items.map((work) => {
        const action = getPrimaryAction(work, canEdit, labels, visitorUrl);
        const title = work.title ?? labels.placeholder;
        const card = (
          <Card className="grid h-full grid-rows-[auto_auto_1fr] overflow-hidden transition-[transform,box-shadow,border-color] duration-200 group-hover/work-card:-translate-y-0.5 group-hover/work-card:border-primary/30 group-hover/work-card:shadow-lg group-focus-visible/work-card:border-ring group-focus-visible/work-card:ring-2 group-focus-visible/work-card:ring-ring group-focus-visible/work-card:ring-offset-2 group-focus-visible/work-card:ring-offset-background motion-reduce:transform-none motion-reduce:transition-none">
            <div className="relative aspect-[3/4] overflow-hidden rounded-t-surface bg-muted">
              {work.poster === null ? (
                <div
                  className="grid h-full place-items-center text-muted-foreground"
                  aria-label={labels.posterFallback}
                >
                  <span className="grid justify-items-center gap-2 text-sm">
                    <ImageOffIcon aria-hidden="true" className="size-8" />
                    {labels.posterFallback}
                  </span>
                </div>
              ) : (
                <Image
                  alt=""
                  className="h-full w-full object-cover transition-transform duration-300 group-hover/card:scale-[1.02] motion-reduce:transition-none"
                  fill
                  loading="lazy"
                  sizes="(max-width: 640px) 100vw, (max-width: 1280px) 50vw, 33vw"
                  src={`/works/${work.publicId}/media/${work.poster.assetId}/${work.poster.variants.at(-1)?.width ?? work.poster.width}`}
                  unoptimized
                />
              )}
            </div>
            <CardHeader className="grid min-h-36 content-start gap-3">
              <div className="flex min-h-14 content-start flex-wrap gap-2">
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
                <h2
                  className="line-clamp-2 min-h-[2.75rem] text-lg"
                  title={work.title ?? undefined}
                >
                  {title}
                </h2>
              </CardTitle>
            </CardHeader>
            <CardContent className="grid content-between gap-4">
              <p className="line-clamp-3 min-h-[3.75rem] text-sm text-muted-foreground">
                {work.summary ?? labels.placeholder}
              </p>
              <div className="flex items-center justify-between gap-3">
                <p className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Clock3Icon aria-hidden="true" className="size-3.5" />
                  {labels.updatedAt} {formatBangkokDate(work.updatedAt)}
                </p>
                {action === null ? null : (
                  <span className="grid size-9 shrink-0 place-items-center rounded-full bg-primary-soft text-primary">
                    <ArrowUpRightIcon aria-hidden="true" className="size-4" />
                  </span>
                )}
              </div>
            </CardContent>
          </Card>
        );

        return (
          <li className="relative h-full" aria-label={title} key={work.publicId}>
            {action === null ? (
              card
            ) : (
              <Link
                aria-label={`${action.label}: ${title}`}
                className="group/work-card block h-full rounded-surface focus-visible:outline-none"
                href={action.href}
              >
                {card}
              </Link>
            )}
            {canEdit && work.publicationState !== 'published' ? (
              <SecondaryActions labels={labels} work={work} />
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}

function getPrimaryAction(
  work: WorkListItem,
  canEdit: boolean,
  labels: Record<string, string>,
  visitorUrl: string,
): { href: string; label: string } | null {
  if (
    work.primaryAction === null ||
    (!canEdit && work.primaryAction !== 'view_details' && work.primaryAction !== 'view_public_work')
  )
    return null;
  const href =
    work.primaryAction === 'view_public_work'
      ? `${visitorUrl}/works/${work.publicId}`
      : `/works/${work.publicId}`;
  return { href, label: labels[`actions.${work.primaryAction}`]! };
}

function SecondaryActions({
  labels,
  work,
}: {
  labels: Record<string, string>;
  work: WorkListItem;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<SavedDraftActionResult['error'] | null>(null);
  if (work.secondaryActions.length === 0 && work.primaryAction !== 'return_to_editing') return null;
  return (
    <details className="absolute top-4 right-4 z-20">
      <summary
        className={buttonVariants({
          className:
            'list-none rounded-full border-border/80 bg-card/95 shadow-md backdrop-blur-sm',
          size: 'icon',
          variant: 'outline',
        })}
      >
        <EllipsisIcon aria-hidden="true" />
        <span className="sr-only">{labels.more}</span>
      </summary>
      <div className="absolute top-[calc(100%+0.5rem)] right-0 z-20 grid min-w-56 gap-2 rounded-control border bg-card p-2 shadow-lg">
        {work.primaryAction === 'return_to_editing' ? (
          <Button
            disabled={pending}
            onClick={() =>
              start(async () => {
                setError(null);
                const result = await restoreSavedDraftAction({
                  expectedVersion: work.version,
                  idempotencyKey: crypto.randomUUID(),
                  publicId: work.publicId,
                });
                if (result.outcome === 'error') {
                  setError(result.error);
                  toast.error(
                    result.error === 'conflict'
                      ? labels.actionErrorConflict
                      : labels.actionErrorUnavailable,
                  );
                  return;
                }
                router.refresh();
                toast.success(labels.restoredSuccess);
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
                    setError(null);
                    const result = await archiveSavedDraftAction({
                      confirmation: true,
                      expectedVersion: work.version,
                      idempotencyKey: crypto.randomUUID(),
                      publicId: work.publicId,
                    });
                    if (result.outcome === 'error') {
                      setError(result.error);
                      toast.error(
                        result.error === 'conflict'
                          ? labels.actionErrorConflict
                          : labels.actionErrorUnavailable,
                      );
                      return;
                    }
                    router.refresh();
                    toast.success(labels.archivedSuccess);
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
      {error !== null ? (
        <p
          aria-live="assertive"
          className="absolute top-full right-0 z-30 mt-2 w-64 rounded-control border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive"
          role="alert"
        >
          {error === 'conflict' ? labels.actionErrorConflict : labels.actionErrorUnavailable}
        </p>
      ) : null}
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
