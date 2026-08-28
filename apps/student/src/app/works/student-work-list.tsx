import { buttonVariants } from '@showcase/ui/button';
import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import type { WorkListItem } from '@/lib/student-works-core';

type WorkflowState =
  'archived' | 'changes_requested' | 'draft' | 'pending_review' | 'published' | 'unpublished';

interface WorkListLabels {
  actions: {
    editDraft: string;
    editRequested: string;
    manage: string;
    view: string;
  };
  publication: Record<WorkListItem['publicationState'], string>;
  status: Record<WorkflowState, string>;
  updatedAt: string;
}

export function StudentWorkList({
  canEdit,
  items,
  labels,
}: {
  canEdit: boolean;
  items: WorkListItem[];
  labels: WorkListLabels;
}) {
  return (
    <ul className="grid gap-4">
      {items.map((work) => {
        const workflowState = getWorkflowState(work);
        const action = getAction(workflowState);
        return (
          <li aria-label={work.title} key={work.publicId}>
            <Card className="transition-colors hover:border-primary/35">
              <CardHeader className="gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start">
                <div className="grid min-w-0 gap-3">
                  <div className="flex flex-wrap gap-2">
                    <Badge variant={workflowBadgeVariant(workflowState)}>
                      {labels.status[workflowState]}
                    </Badge>
                    <Badge variant="outline">{labels.publication[work.publicationState]}</Badge>
                  </div>
                  <CardTitle>
                    <h2 className="text-xl font-semibold text-balance">{work.title}</h2>
                  </CardTitle>
                </div>
              </CardHeader>
              <CardContent>
                <time className="text-sm text-muted-foreground" dateTime={work.updatedAt}>
                  {labels.updatedAt} {formatBangkokDate(work.updatedAt)}
                </time>
              </CardContent>
              {canEdit ? (
                <CardFooter className="justify-end">
                  <Link
                    className={buttonVariants({ variant: 'outline' })}
                    href={`/works/${work.publicId}`}
                  >
                    {labels.actions[action]}
                  </Link>
                </CardFooter>
              ) : null}
            </Card>
          </li>
        );
      })}
    </ul>
  );
}

function getWorkflowState(work: WorkListItem): WorkflowState {
  if (work.activityState === 'archived') return 'archived';
  if (work.latestRevisionStatus === 'pending_review') return 'pending_review';
  if (work.latestRevisionStatus === 'changes_requested') return 'changes_requested';
  if (work.hasDraft) return 'draft';
  return work.publicationState === 'published' ? 'published' : 'unpublished';
}

function getAction(state: WorkflowState): 'editDraft' | 'editRequested' | 'manage' | 'view' {
  if (state === 'changes_requested') return 'editRequested';
  if (state === 'draft') return 'editDraft';
  if (state === 'published' || state === 'unpublished') return 'manage';
  return 'view';
}

function workflowBadgeVariant(
  state: WorkflowState,
): 'default' | 'destructive' | 'outline' | 'secondary' {
  if (state === 'changes_requested') return 'destructive';
  if (state === 'archived') return 'outline';
  if (state === 'pending_review') return 'secondary';
  return 'default';
}

function formatBangkokDate(value: string): string {
  return new Intl.DateTimeFormat('th-TH', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Asia/Bangkok',
  }).format(new Date(value));
}
