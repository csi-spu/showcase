import { Inject, Injectable } from '@nestjs/common';
import type { Clock, IdentityProtector } from '../../auth/application/auth.ports';
import { AUTH_CLOCK, AUTH_IDENTITY_PROTECTOR } from '../../auth/application/auth.ports';
import {
  MAX_ROSTER_FILE_BYTES,
  RosterCsvError,
  parseRosterCsv,
  prepareRosterStudent,
  type RosterRow,
} from '../domain/roster-csv';
import { createRosterErrorCsv } from '../domain/roster-error-csv';
import {
  RosterConflictResolutionError,
  prepareRosterConflictResolution,
  type RosterConflictResolution,
} from '../domain/roster-conflict-resolution';
import {
  ROSTER_REPOSITORY,
  type RosterBatch,
  type RosterConflict,
  type RosterConflictPage,
  type RosterRepository,
  type RosterRowErrorPage,
} from './roster.ports';

export type RosterImportErrorCode =
  | 'ROSTER_BATCH_NOT_FOUND'
  | 'ROSTER_CONFLICT_IDEMPOTENCY_CONFLICT'
  | 'ROSTER_CONFLICT_NOT_FOUND'
  | 'ROSTER_CONFLICT_REASON_INVALID'
  | 'ROSTER_CONFLICT_REASON_REQUIRED'
  | 'ROSTER_CONFLICT_VERSION_CONFLICT'
  | 'ROSTER_FILE_TOO_LARGE'
  | RosterCsvError['code'];

export class RosterImportError extends Error {
  constructor(
    readonly code: RosterImportErrorCode,
    readonly status: number,
  ) {
    super(code);
    this.name = 'RosterImportError';
  }
}

@Injectable()
export class RosterImportService {
  constructor(
    @Inject(ROSTER_REPOSITORY) private readonly repository: RosterRepository,
    @Inject(AUTH_CLOCK) private readonly clock: Clock,
    @Inject(AUTH_IDENTITY_PROTECTOR) private readonly identityProtector: IdentityProtector,
  ) {}

  async createBatch(input: { actorAccountId: string; content: Uint8Array }): Promise<RosterBatch> {
    if (input.content.byteLength > MAX_ROSTER_FILE_BYTES) {
      throw new RosterImportError('ROSTER_FILE_TOO_LARGE', 413);
    }

    let rows;
    try {
      rows = parseRosterCsv(input.content);
    } catch (error: unknown) {
      if (error instanceof RosterCsvError) {
        throw new RosterImportError(error.code, 422);
      }
      throw error;
    }

    return this.repository.createBatch({
      now: this.clock.now(),
      rows: rows.map((row) => {
        if ('errorCode' in row) return row;
        return this.protectRowIdentity(row);
      }),
      uploaderAccountId: input.actorAccountId,
    });
  }

  async createStudent(input: {
    actorAccountId: string;
    firstNameTh: string;
    lastNameTh: string;
    studentId: string;
  }): Promise<RosterBatch> {
    const row = prepareRosterStudent(input);
    if ('errorCode' in row) {
      throw new RosterImportError(row.errorCode, 422);
    }
    return this.repository.createBatch({
      now: this.clock.now(),
      rows: [this.protectRowIdentity(row)],
      uploaderAccountId: input.actorAccountId,
    });
  }

  async getBatch(batchId: string): Promise<RosterBatch> {
    const batch = await this.repository.getBatch(batchId);
    if (batch === null) {
      throw new RosterImportError('ROSTER_BATCH_NOT_FOUND', 404);
    }
    return batch;
  }

  async getErrorCsv(batchId: string): Promise<string> {
    await this.getBatch(batchId);
    return createRosterErrorCsv(await this.repository.getErrorRows(batchId));
  }

  async listConflicts(input: {
    afterRowNumber: number | null;
    batchId: string;
    limit: number;
  }): Promise<RosterConflictPage> {
    await this.getBatch(input.batchId);
    return this.repository.listConflicts(input);
  }

  async listErrorRows(input: {
    afterRowNumber: number | null;
    batchId: string;
    limit: number;
  }): Promise<RosterRowErrorPage> {
    await this.getBatch(input.batchId);
    return this.repository.listErrorRows(input);
  }

  async resolveConflict(input: {
    actorAccountId: string;
    conflictId: string;
    expectedVersion: number;
    idempotencyKey: string;
    reason?: string;
    resolution: RosterConflictResolution;
  }): Promise<RosterConflict> {
    let prepared;
    try {
      prepared = prepareRosterConflictResolution(input);
    } catch (error: unknown) {
      if (error instanceof RosterConflictResolutionError) {
        throw new RosterImportError(error.code, 422);
      }
      throw error;
    }
    const result = await this.repository.resolveConflict({
      actorAccountId: input.actorAccountId,
      conflictId: input.conflictId,
      expectedVersion: input.expectedVersion,
      idempotencyKey: input.idempotencyKey,
      now: this.clock.now(),
      ...prepared,
    });
    switch (result.outcome) {
      case 'replayed':
      case 'resolved':
        return result.conflict;
      case 'not_found':
        throw new RosterImportError('ROSTER_CONFLICT_NOT_FOUND', 404);
      case 'version_conflict':
        throw new RosterImportError('ROSTER_CONFLICT_VERSION_CONFLICT', 409);
      case 'idempotency_conflict':
        throw new RosterImportError('ROSTER_CONFLICT_IDEMPOTENCY_CONFLICT', 409);
    }
  }

  private protectRowIdentity(row: RosterRow) {
    const studentIdHash = this.identityProtector.hashStudentId(row.studentId);
    return {
      ...row,
      providerUserId: providerUserIdFromStudentIdHash(studentIdHash),
      studentIdHash,
      syntheticIdentity: this.identityProtector.toSyntheticIdentity(row.studentId),
    };
  }
}

export function providerUserIdFromStudentIdHash(studentIdHash: string): string {
  const bytes = studentIdHash.slice(0, 32).split('');
  bytes[12] = '5';
  const variantNibble = Number.parseInt(bytes[16] ?? '0', 16);
  bytes[16] = ((variantNibble & 0x3) | 0x8).toString(16);
  const hex = bytes.join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
