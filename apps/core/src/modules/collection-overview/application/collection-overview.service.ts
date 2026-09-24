import { Inject, Injectable } from '@nestjs/common';
import { decodeAttentionCursor } from './collection-attention-cursor';
import {
  COLLECTION_OVERVIEW_REPOSITORY,
  CollectionOverviewError,
  type CollectionFilterOptions,
  type CollectionOverview,
  type CollectionOverviewRepository,
  type CollectionOverviewScope,
  type CollectionStudentAttentionPage,
} from './collection-overview.ports';

export const DEFAULT_OVERVIEW_ATTENTION_LIMIT = 5;
export const MAX_OVERVIEW_ATTENTION_LIMIT = 10;
export const DEFAULT_OVERVIEW_UPCOMING_LIMIT = 3;
export const MAX_OVERVIEW_UPCOMING_LIMIT = 10;
export const DEFAULT_OVERVIEW_PROGRESS_LIMIT = 6;
export const MAX_OVERVIEW_PROGRESS_LIMIT = 12;
export const DEFAULT_STUDENT_ATTENTION_LIMIT = 20;
export const MAX_STUDENT_ATTENTION_LIMIT = 50;

/** Bounds for the dropdown source lists, which are read-only and never paged. */
export const MAX_FILTER_ROUNDS = 50;
export const MAX_FILTER_GROUPS = 200;

export interface CollectionOverviewScopeInput {
  entryYear?: number | undefined;
  groupId?: string | undefined;
  roundId?: string | undefined;
}

export interface CollectionOverviewInput extends CollectionOverviewScopeInput {
  attentionLimit?: number | undefined;
  progressLimit?: number | undefined;
  upcomingLimit?: number | undefined;
}

export interface CollectionStudentAttentionInput extends CollectionOverviewScopeInput {
  cursor?: string | undefined;
  limit?: number | undefined;
}

function clampLimit(requested: number | undefined, fallback: number, maximum: number): number {
  if (requested === undefined || !Number.isFinite(requested)) return fallback;
  return Math.max(1, Math.min(maximum, Math.trunc(requested)));
}

@Injectable()
export class CollectionOverviewService {
  constructor(
    @Inject(COLLECTION_OVERVIEW_REPOSITORY)
    private readonly repository: CollectionOverviewRepository,
  ) {}

  getOverview(input: CollectionOverviewInput = {}): Promise<CollectionOverview> {
    return this.repository.getOverview({
      attentionLimit: clampLimit(
        input.attentionLimit,
        DEFAULT_OVERVIEW_ATTENTION_LIMIT,
        MAX_OVERVIEW_ATTENTION_LIMIT,
      ),
      progressLimit: clampLimit(
        input.progressLimit,
        DEFAULT_OVERVIEW_PROGRESS_LIMIT,
        MAX_OVERVIEW_PROGRESS_LIMIT,
      ),
      scope: toScope(input),
      upcomingLimit: clampLimit(
        input.upcomingLimit,
        DEFAULT_OVERVIEW_UPCOMING_LIMIT,
        MAX_OVERVIEW_UPCOMING_LIMIT,
      ),
    });
  }

  /**
   * One page of Students with something still outstanding.
   *
   * A cursor that does not decode is rejected rather than ignored: silently
   * restarting at page one would make a paging client loop forever.
   */
  async getStudentAttention(
    input: CollectionStudentAttentionInput = {},
  ): Promise<CollectionStudentAttentionPage> {
    const cursor = input.cursor === undefined ? null : decodeAttentionCursor(input.cursor);
    if (input.cursor !== undefined && cursor === null) {
      throw new CollectionOverviewError('INVALID_CURSOR', 400);
    }

    return this.repository.getStudentAttention({
      cursor,
      limit: clampLimit(input.limit, DEFAULT_STUDENT_ATTENTION_LIMIT, MAX_STUDENT_ATTENTION_LIMIT),
      scope: toScope(input),
    });
  }

  getFilterOptions(): Promise<CollectionFilterOptions> {
    return this.repository.getFilterOptions({
      groupLimit: MAX_FILTER_GROUPS,
      roundLimit: MAX_FILTER_ROUNDS,
    });
  }
}

function toScope(input: CollectionOverviewScopeInput): CollectionOverviewScope {
  return {
    entryYear: input.entryYear ?? null,
    groupId: input.groupId ?? null,
    roundId: input.roundId ?? null,
  };
}
