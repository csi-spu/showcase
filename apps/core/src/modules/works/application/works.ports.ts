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
  publicationState: 'never_published';
  publicId: string;
  version: number;
}

export type WorkMutationResult =
  | { outcome: 'idempotency_conflict' | 'not_found' | 'version_conflict' }
  | { outcome: 'created' | 'replayed' | 'updated'; work: WorkDraftView };

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
  updateDraft(input: {
    actorAccountId: string;
    draft: NormalizedWorkDraft;
    expectedVersion: number;
    idempotencyKey: string;
    now: Date;
    publicId: string;
  }): Promise<WorkMutationResult>;
}
