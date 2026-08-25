import { Inject, Injectable } from '@nestjs/common';
import type { Clock, IdentityProtector } from '../../auth/application/auth.ports';
import { AUTH_CLOCK, AUTH_IDENTITY_PROTECTOR } from '../../auth/application/auth.ports';
import { MAX_ROSTER_FILE_BYTES, RosterCsvError, parseRosterCsv } from '../domain/roster-csv';
import { ROSTER_REPOSITORY, type RosterBatch, type RosterRepository } from './roster.ports';

export type RosterImportErrorCode =
  'ROSTER_BATCH_NOT_FOUND' | 'ROSTER_FILE_TOO_LARGE' | RosterCsvError['code'];

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
        const studentIdHash = this.identityProtector.hashStudentId(row.studentId);
        return {
          ...row,
          providerUserId: providerUserIdFromStudentIdHash(studentIdHash),
          studentIdHash,
          syntheticIdentity: this.identityProtector.toSyntheticIdentity(row.studentId),
        };
      }),
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
}

export function providerUserIdFromStudentIdHash(studentIdHash: string): string {
  const bytes = studentIdHash.slice(0, 32).split('');
  bytes[12] = '5';
  const variantNibble = Number.parseInt(bytes[16] ?? '0', 16);
  bytes[16] = ((variantNibble & 0x3) | 0x8).toString(16);
  const hex = bytes.join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
