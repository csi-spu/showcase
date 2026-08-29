import type { WorkDraftContributorView } from './works.ports';

export const WORK_CONTRIBUTORS_CLOCK = Symbol('WORK_CONTRIBUTORS_CLOCK');
export const WORK_CONTRIBUTORS_REPOSITORY = Symbol('WORK_CONTRIBUTORS_REPOSITORY');

export interface WorkContributorsClock {
  now(): Date;
}

export interface ContributorCandidateView {
  candidateReference: string;
  firstName: string;
  lastName: string;
}

export type ContributorMutationFailure =
  | 'candidate_invalid'
  | 'contributor_duplicate'
  | 'contributor_limit_reached'
  | 'cutover_unavailable'
  | 'idempotency_conflict'
  | 'not_found'
  | 'pending_revision_exists'
  | 'version_conflict';

export type ContributorMutationResult =
  | {
      contributors: WorkDraftContributorView[];
      outcome: 'added' | 'removed' | 'replayed';
      version: number;
    }
  | { outcome: ContributorMutationFailure };

export interface WorkContributorsRepository {
  addAccount(input: {
    actorAccountId: string;
    candidateReference: string;
    contributionRole: string;
    expectedVersion: number;
    idempotencyKey: string;
    now: Date;
    workPublicId: string;
  }): Promise<ContributorMutationResult>;
  addExternal(input: {
    actorAccountId: string;
    attributionName: string;
    contributionRole: string;
    expectedVersion: number;
    idempotencyKey: string;
    now: Date;
    workPublicId: string;
  }): Promise<ContributorMutationResult>;
  searchCandidates(input: {
    actorAccountId: string;
    nameQuery: string | null;
    now: Date;
    sourceKeyHash: string;
    studentIdHash: string | null;
    workPublicId: string;
  }): Promise<
    | { candidates: ContributorCandidateView[]; outcome: 'matches' }
    | { outcome: 'cutover_unavailable' | 'no_match' | 'not_found' | 'rate_limited' }
  >;
  remove(input: {
    actorAccountId: string;
    contributorPublicId: string;
    expectedVersion: number;
    idempotencyKey: string;
    now: Date;
    workPublicId: string;
  }): Promise<ContributorMutationResult>;
}
