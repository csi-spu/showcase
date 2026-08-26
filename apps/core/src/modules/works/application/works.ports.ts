import type { NormalizedWorkDraft } from '../domain/work-draft-policy';

export const WORKS_CLOCK = Symbol('WORKS_CLOCK');
export const WORKS_REPOSITORY = Symbol('WORKS_REPOSITORY');

export interface WorksClock {
  now(): Date;
}

export interface WorkAuthoringContext {
  currentAcademicYear: number | null;
  entryYear: number;
  personId: string;
}

export interface WorkDraftView {
  activityState: 'active';
  basePublishedRevisionId: string | null;
  draft: NormalizedWorkDraft;
  publicationState: 'never_published' | 'published' | 'unpublished';
  publishedRevisionId: string | null;
  publicId: string;
  version: number;
}

export type WorkMutationResult =
  | {
      outcome:
        | 'draft_exists'
        | 'idempotency_conflict'
        | 'not_found'
        | 'pending_revision_exists'
        | 'published_revision_conflict'
        | 'version_conflict'
        | 'work_not_published';
    }
  | { outcome: 'created' | 'replayed' | 'updated'; work: WorkDraftView };

export interface WorkAuthoringState {
  activityState: 'active';
  draft: WorkDraftView | null;
  publicationState: 'never_published' | 'published' | 'unpublished';
  publishedRevisionId: string | null;
  publicId: string;
}

export interface WorksRepository {
  createWork(input: {
    actorAccountId: string;
    draft: NormalizedWorkDraft;
    idempotencyKey: string;
    now: Date;
    submitterPersonId: string;
  }): Promise<WorkMutationResult>;
  findAuthoringContext(accountId: string): Promise<WorkAuthoringContext | null>;
  findOwnedDraft(accountId: string, publicId: string): Promise<WorkDraftView | null>;
  findOwnedWorkState(accountId: string, publicId: string): Promise<WorkAuthoringState | null>;
  rebaseDraft(input: {
    actorAccountId: string;
    expectedPublishedRevisionId: string;
    expectedVersion: number;
    idempotencyKey: string;
    now: Date;
    publicId: string;
  }): Promise<WorkMutationResult>;
  seedDraft(input: {
    actorAccountId: string;
    expectedPublishedRevisionId: string;
    idempotencyKey: string;
    now: Date;
    publicId: string;
  }): Promise<WorkMutationResult>;
  updateDraft(input: {
    actorAccountId: string;
    draft: NormalizedWorkDraft;
    expectedVersion: number;
    idempotencyKey: string;
    now: Date;
    publicId: string;
  }): Promise<WorkMutationResult>;
}
