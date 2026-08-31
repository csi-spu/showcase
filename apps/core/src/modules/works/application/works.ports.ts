import type {
  NormalizedVideoLink,
  NormalizedWorkDraft,
  NormalizedWorkDraftPatch,
  WorkCategory,
  WorkSemester,
} from '../domain/work-draft-policy';

export const WORKS_CLOCK = Symbol('WORKS_CLOCK');
export const WORKS_CURSOR_CODEC = Symbol('WORKS_CURSOR_CODEC');
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
  contributors: WorkDraftContributorView[];
  draft: WorkDraftState;
  isComplete: boolean;
  media: WorkDraftMediaView[];
  publicationState: 'never_published' | 'published' | 'unpublished';
  publishedRevisionId: string | null;
  publicId: string;
  savedAt: Date;
  submitterAttributionName: string | null;
  version: number;
}

export interface WorkDraftMediaView {
  assetId: string;
  height: number | null;
  kind: 'gallery' | 'poster';
  position: number;
  rejectionCode: 'expired' | 'invalid_media' | 'processing_failed' | null;
  status: 'pending_upload' | 'processing' | 'ready' | 'rejected' | 'uploaded';
  width: number | null;
}

export interface WorkDraftContributorView {
  attributionName: string;
  contributionRole: string | null;
  kind: 'account' | 'external';
  publicId: string;
}

export interface WorkDraftState {
  academicPeriod: { semester: WorkSemester | null; year: number | null };
  category: WorkCategory | null;
  description: string | null;
  links: NormalizedWorkDraft['links'];
  submitterStudyYear: number | null;
  summary: string | null;
  tags: NormalizedWorkDraft['tags'];
  title: string | null;
  videoLinks: NormalizedVideoLink[];
}

export interface WorkListCursor {
  direction: 'next' | 'previous';
  publicId: string;
  updatedAt: Date;
}

export type WorkManagementView = 'current' | 'saved';
export type WorkManagementCategory = WorkCategory | 'all';
export type WorkManagementSort = 'updated_asc' | 'updated_desc';
export type WorkManagementStatus =
  'all' | 'changes_requested' | 'draft' | 'pending_review' | 'published';

export type WorkCardPrimaryAction =
  'continue_editing' | 'return_to_editing' | 'view_details' | 'view_public_work';

export type WorkCardSecondaryAction =
  'archive_saved_draft' | 'create_new_revision' | 'withdraw_submission';

export interface WorkPrivatePoster {
  assetId: string;
  height: number;
  variants: Array<{ height: number; width: number }>;
  width: number;
}

export interface WorkListItem {
  activityState: 'active' | 'archived';
  academicPeriod: { semester: WorkSemester; year: number } | null;
  category: WorkCategory | null;
  displayedSource: 'draft' | 'pending_revision' | 'placeholder' | 'published_revision';
  hasDraft: boolean;
  isDraftComplete: boolean;
  latestRevisionStatus: 'approved' | 'changes_requested' | 'pending_review' | 'withdrawn' | null;
  poster: WorkPrivatePoster | null;
  primaryAction: WorkCardPrimaryAction | null;
  publicationState: 'never_published' | 'published' | 'unpublished';
  publicId: string;
  secondaryActions: WorkCardSecondaryAction[];
  summary: string | null;
  title: string | null;
  updatedAt: Date;
  version: number;
}

export interface WorkListPage {
  currentPage: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
  items: WorkListItem[];
  nextCursor: WorkListCursor | null;
  pageSize: number;
  previousCursor: WorkListCursor | null;
  totalItems: number;
  totalPages: number;
}

export interface StudentWorkspaceSummary {
  canMutate: boolean;
  changeRequestCount: number;
  draftCount: number;
  latestActionableDraftPublicId: string | null;
  pendingReviewCount: number;
  publishedCount: number;
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

export interface SavedDraftWorkView {
  activityState: 'active' | 'archived';
  publicationState: 'never_published';
  publicId: string;
  version: number;
}

export type SavedDraftMutationResult =
  | { outcome: 'archived' | 'replayed' | 'restored'; work: SavedDraftWorkView }
  | { outcome: 'idempotency_conflict' | 'not_found' | 'state_conflict' | 'version_conflict' };

export interface WorkAuthoringState {
  activityState: 'active';
  draft: WorkDraftView | null;
  publicationState: 'never_published' | 'published' | 'unpublished';
  publishedRevisionId: string | null;
  publicId: string;
}

type CreateWorkCommon = {
  actorAccountId: string;
  idempotencyKey: string;
  now: Date;
  submitterPersonId: string;
};

export type CreateWorkPersistenceInput = CreateWorkCommon &
  (
    | { draft: NormalizedWorkDraft; patch?: never }
    | { draft?: never; patch: NormalizedWorkDraftPatch }
  );

export interface WorksRepository {
  archiveSavedDraft(input: {
    actorAccountId: string;
    expectedVersion: number;
    idempotencyKey: string;
    now: Date;
    publicId: string;
  }): Promise<SavedDraftMutationResult>;
  createWork(input: CreateWorkPersistenceInput): Promise<WorkMutationResult>;
  findAuthoringContext(accountId: string): Promise<WorkAuthoringContext | null>;
  findOwnedDraft(accountId: string, publicId: string): Promise<WorkDraftView | null>;
  findOwnedWorkState(accountId: string, publicId: string): Promise<WorkAuthoringState | null>;
  listOwnedWorks(input: {
    accountId: string;
    category: WorkManagementCategory;
    cursor: WorkListCursor | null;
    limit: 12;
    page: number;
    query: string;
    sort: WorkManagementSort;
    status: WorkManagementStatus;
    view: WorkManagementView;
  }): Promise<WorkListPage>;
  getWorkspaceSummary(accountId: string): Promise<StudentWorkspaceSummary | null>;
  patchDraft(input: {
    actorAccountId: string;
    expectedVersion: number;
    idempotencyKey: string;
    now: Date;
    patch: NormalizedWorkDraftPatch;
    publicId: string;
  }): Promise<WorkMutationResult>;
  restoreSavedDraft(input: {
    actorAccountId: string;
    expectedVersion: number;
    idempotencyKey: string;
    now: Date;
    publicId: string;
  }): Promise<SavedDraftMutationResult>;
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
