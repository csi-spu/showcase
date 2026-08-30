import { Inject, Injectable, Logger } from '@nestjs/common';
import { AUTH_IDENTITY_PROTECTOR, type IdentityProtector } from '../../auth/application/auth.ports';
import {
  normalizeContributionRole,
  normalizeContributorSearchQuery,
  normalizeExternalContributor,
} from '../domain/work-contributor-policy';
import {
  WORK_CONTRIBUTORS_CLOCK,
  WORK_CONTRIBUTORS_REPOSITORY,
  type ContributorMutationFailure,
  type ContributorMutationResult,
  type WorkContributorsClock,
  type WorkContributorsRepository,
} from './work-contributors.ports';

type WorkContributorErrorCode =
  | 'CONTRIBUTOR_CANDIDATE_INVALID'
  | 'CONTRIBUTOR_CUTOVER_UNAVAILABLE'
  | 'CONTRIBUTOR_DUPLICATE'
  | 'CONTRIBUTOR_IDEMPOTENCY_CONFLICT'
  | 'CONTRIBUTOR_LIMIT_REACHED'
  | 'CONTRIBUTOR_LOOKUP_RATE_LIMITED'
  | 'CONTRIBUTOR_NOT_FOUND'
  | 'INVALID_CONTRIBUTOR'
  | 'WORK_PENDING_REVISION_EXISTS'
  | 'WORK_VERSION_CONFLICT';

export class WorkContributorError extends Error {
  constructor(
    readonly code: WorkContributorErrorCode,
    readonly status: number,
  ) {
    super(code);
    this.name = 'WorkContributorError';
  }
}

@Injectable()
export class WorkContributorsService {
  private readonly logger = new Logger(WorkContributorsService.name);

  constructor(
    @Inject(WORK_CONTRIBUTORS_REPOSITORY)
    private readonly repository: WorkContributorsRepository,
    @Inject(WORK_CONTRIBUTORS_CLOCK) private readonly clock: WorkContributorsClock,
    @Inject(AUTH_IDENTITY_PROTECTOR) private readonly identityProtector: IdentityProtector,
  ) {}

  async search(input: {
    actorAccountId: string;
    query: string;
    sourceAddress: string;
    workPublicId: string;
  }) {
    const query = normalizeContributorSearchQuery(input.query);
    if (query === null) {
      throw new WorkContributorError('INVALID_CONTRIBUTOR', 422);
    }
    const result = await this.repository.searchCandidates({
      actorAccountId: input.actorAccountId,
      nameQuery: query.kind === 'name' ? query.nameQuery : null,
      now: this.clock.now(),
      sourceKeyHash: this.identityProtector.hashSourceAddress(input.sourceAddress),
      studentIdPrefixHash:
        query.kind === 'student_id_prefix'
          ? this.identityProtector.hashStudentId(query.studentIdPrefix)
          : null,
      studentIdPrefixLength:
        query.kind === 'student_id_prefix' ? query.studentIdPrefix.length : null,
      workPublicId: input.workPublicId,
    });
    this.logger.log({
      actorAccountId: input.actorAccountId,
      operation: 'work_contributor_search',
      outcome: result.outcome,
      workPublicId: input.workPublicId,
    });
    if (result.outcome === 'matches') return result.candidates;
    if (result.outcome === 'rate_limited') {
      throw new WorkContributorError('CONTRIBUTOR_LOOKUP_RATE_LIMITED', 429);
    }
    if (result.outcome === 'cutover_unavailable') {
      throw new WorkContributorError('CONTRIBUTOR_CUTOVER_UNAVAILABLE', 503);
    }
    if (result.outcome === 'not_found') {
      throw new WorkContributorError('CONTRIBUTOR_NOT_FOUND', 404);
    }
    return [];
  }

  async addAccount(input: {
    actorAccountId: string;
    candidateReference: string;
    contributionRole: string;
    expectedVersion: number;
    idempotencyKey: string;
    workPublicId: string;
  }) {
    const contributionRole = normalizeContributionRole(input.contributionRole);
    if (contributionRole === null) throw new WorkContributorError('INVALID_CONTRIBUTOR', 422);
    const result = this.requireSuccess(
      await this.repository.addAccount({
        ...input,
        contributionRole,
        now: this.clock.now(),
      }),
    );
    this.logMutation(input.actorAccountId, input.workPublicId, 'account_added', result.outcome);
    return result;
  }

  async addExternal(input: {
    actorAccountId: string;
    attributionName: string;
    contributionRole: string;
    expectedVersion: number;
    idempotencyKey: string;
    workPublicId: string;
  }) {
    const normalized = normalizeExternalContributor(input);
    if (normalized === null) throw new WorkContributorError('INVALID_CONTRIBUTOR', 422);
    const result = this.requireSuccess(
      await this.repository.addExternal({
        actorAccountId: input.actorAccountId,
        ...normalized,
        expectedVersion: input.expectedVersion,
        idempotencyKey: input.idempotencyKey,
        now: this.clock.now(),
        workPublicId: input.workPublicId,
      }),
    );
    this.logMutation(input.actorAccountId, input.workPublicId, 'external_added', result.outcome);
    return result;
  }

  async remove(input: {
    actorAccountId: string;
    contributorPublicId: string;
    expectedVersion: number;
    idempotencyKey: string;
    workPublicId: string;
  }) {
    const result = this.requireSuccess(
      await this.repository.remove({ ...input, now: this.clock.now() }),
    );
    this.logMutation(input.actorAccountId, input.workPublicId, 'removed', result.outcome);
    return result;
  }

  private logMutation(
    actorAccountId: string,
    workPublicId: string,
    mutation: string,
    outcome: string,
  ) {
    this.logger.log({
      actorAccountId,
      mutation,
      operation: 'work_contributor_mutation',
      outcome,
      workPublicId,
    });
  }

  private requireSuccess(result: ContributorMutationResult) {
    if ('contributors' in result) return result;
    const mapping: Record<ContributorMutationFailure, [WorkContributorErrorCode, number]> = {
      candidate_invalid: ['CONTRIBUTOR_CANDIDATE_INVALID', 422],
      contributor_duplicate: ['CONTRIBUTOR_DUPLICATE', 422],
      contributor_limit_reached: ['CONTRIBUTOR_LIMIT_REACHED', 422],
      cutover_unavailable: ['CONTRIBUTOR_CUTOVER_UNAVAILABLE', 503],
      idempotency_conflict: ['CONTRIBUTOR_IDEMPOTENCY_CONFLICT', 409],
      not_found: ['CONTRIBUTOR_NOT_FOUND', 404],
      pending_revision_exists: ['WORK_PENDING_REVISION_EXISTS', 409],
      version_conflict: ['WORK_VERSION_CONFLICT', 409],
    };
    const [code, status] = mapping[result.outcome];
    throw new WorkContributorError(code, status);
  }
}
