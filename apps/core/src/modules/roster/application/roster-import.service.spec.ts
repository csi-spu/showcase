import { ConfigService } from '@nestjs/config';
import { reportOperationalError } from '../../../observability/sentry';
import type { Clock, IdentityProtector } from '../../auth/application/auth.ports';
import {
  type ClaimedRosterRow,
  type CreateRosterBatchInput,
  type ExistingRosterStudent,
  isInvalidRosterRow,
  isPreparedRosterRow,
  type RosterBatch,
  type RosterConflict,
  type RosterConflictPage,
  type RosterRepository,
  type RosterRowErrorPage,
  type ResolveRosterConflictResult,
  type StudentIdentityProvider,
} from './roster.ports';
import type { RosterErrorRow } from '../domain/roster-error-csv';
import { RosterImportError, RosterImportService } from './roster-import.service';
import { RosterWorker } from './roster.worker';

jest.mock('../../../observability/sentry', () => ({ reportOperationalError: jest.fn() }));

const NOW = new Date('2026-08-25T06:00:00.000Z');
const ADMIN_ACCOUNT_ID = '10000000-0000-4000-8000-000000000001';

class MemoryRosterRepository implements RosterRepository {
  readonly conflicts: RosterConflict[] = [];
  readonly errors: RosterErrorRow[] = [];
  readonly existing = new Map<string, ExistingRosterStudent>();
  readonly prefixHashes = new Map<string, string[]>();
  readonly rows: ClaimedRosterRow[] = [];
  batch: RosterBatch | null = null;

  claimRows(): Promise<ClaimedRosterRow[]> {
    return Promise.resolve(this.rows.filter((row) => row.attemptCount < 3));
  }

  completeProvisioning(input: {
    batchId: string;
    entryYear: number;
    firstNameTh: string;
    lastNameTh: string;
    now: Date;
    providerUserId: string;
    rowId: string;
    studentIdHash: string;
    studentIdPrefixHashes?: string[];
    syntheticIdentity: string;
  }): Promise<'created' | 'unchanged'> {
    const outcome = this.existing.has(input.studentIdHash) ? 'unchanged' : 'created';
    this.existing.set(input.studentIdHash, {
      firstNameTh: input.firstNameTh,
      lastNameTh: input.lastNameTh,
      personId: 'person-1',
    });
    this.prefixHashes.set(input.studentIdHash, input.studentIdPrefixHashes ?? []);
    this.finishRow(input.rowId, outcome);
    return Promise.resolve(outcome);
  }

  createBatch(input: CreateRosterBatchInput): Promise<RosterBatch> {
    const validRows = input.rows.filter(isPreparedRosterRow);
    const failedCount = input.rows.length - validRows.length;
    this.errors.push(...input.rows.filter(isInvalidRosterRow).map((row) => ({ ...row })));
    this.rows.push(
      ...validRows.map((row, index) => ({
        ...row,
        attemptCount: 0,
        batchId: 'batch-1',
        rowId: `row-${index + 1}`,
      })),
    );
    this.batch = {
      batchId: 'batch-1',
      createdCount: 0,
      entryYears: [...new Set(validRows.map((row) => row.entryYear))].sort(),
      failedCount,
      processedRowCount: failedCount,
      status: validRows.length === 0 ? 'completed_with_errors' : 'pending',
      totalRowCount: input.rows.length,
      unchangedCount: 0,
      uploadedAt: input.now,
    };
    return Promise.resolve(this.batch);
  }

  deleteExpiredRowContent(): Promise<number> {
    return Promise.resolve(0);
  }

  findExistingStudent(studentIdHash: string): Promise<ExistingRosterStudent | null> {
    return Promise.resolve(this.existing.get(studentIdHash) ?? null);
  }

  getBatch(batchId: string): Promise<RosterBatch | null> {
    return Promise.resolve(this.batch?.batchId === batchId ? this.batch : null);
  }

  getErrorRows(): Promise<RosterErrorRow[]> {
    return Promise.resolve(this.errors);
  }

  listConflicts(): Promise<RosterConflictPage> {
    return Promise.resolve({ conflicts: this.conflicts, nextAfterRowNumber: null });
  }

  listErrorRows(): Promise<RosterRowErrorPage> {
    return Promise.resolve({ errors: [], nextAfterRowNumber: null });
  }

  markUnchanged(input: { rowId: string }): Promise<void> {
    this.finishRow(input.rowId, 'unchanged');
    return Promise.resolve();
  }

  recordFailure(input: {
    attemptCount: number;
    errorCode: RosterErrorRow['errorCode'];
    rowId: string;
  }): Promise<void> {
    const row = this.rows.find((candidate) => candidate.rowId === input.rowId);
    if (row !== undefined) {
      row.attemptCount = input.attemptCount;
      if (input.attemptCount >= 3) {
        this.errors.push({
          errorCode: input.errorCode,
          rowNumber: row.rowNumber,
          studentId: row.studentId,
        });
        this.finishRow(input.rowId, 'failed');
      }
    }
    return Promise.resolve();
  }

  resolveConflict(): Promise<ResolveRosterConflictResult> {
    return Promise.resolve({ outcome: 'not_found' });
  }

  settleExistingRow(input: {
    batchId: string;
    now: Date;
    rowId: string;
    studentIdHash: string;
    studentIdPrefixHashes?: string[];
  }): Promise<'conflict' | 'missing' | 'unchanged'> {
    const row = this.rows.find((candidate) => candidate.rowId === input.rowId);
    const existing = this.existing.get(input.studentIdHash);
    if (row === undefined || existing === undefined) return Promise.resolve('missing');
    this.prefixHashes.set(input.studentIdHash, input.studentIdPrefixHashes ?? []);
    if (existing.firstNameTh === row.firstNameTh && existing.lastNameTh === row.lastNameTh) {
      this.finishRow(input.rowId, 'unchanged');
      return Promise.resolve('unchanged');
    }
    this.conflicts.push({
      batchId: input.batchId,
      conflictId: 'conflict-1',
      existingFirstNameTh: existing.firstNameTh,
      existingLastNameTh: existing.lastNameTh,
      incomingFirstNameTh: row.firstNameTh,
      incomingLastNameTh: row.lastNameTh,
      reason: null,
      resolution: null,
      resolvedAt: null,
      rowNumber: row.rowNumber,
      status: 'pending',
      version: 1,
    });
    this.errors.push({
      errorCode: 'ROSTER_CONFLICT',
      rowNumber: row.rowNumber,
      studentId: row.studentId,
    });
    this.finishRow(input.rowId, 'failed');
    return Promise.resolve('conflict');
  }

  private finishRow(rowId: string, outcome: 'created' | 'failed' | 'unchanged'): void {
    const index = this.rows.findIndex((row) => row.rowId === rowId);
    if (index >= 0) {
      this.rows.splice(index, 1);
    }
    if (this.batch === null) {
      return;
    }
    this.batch.processedRowCount += 1;
    if (outcome === 'created') this.batch.createdCount += 1;
    if (outcome === 'unchanged') this.batch.unchangedCount += 1;
    if (outcome === 'failed') this.batch.failedCount += 1;
    if (this.batch.processedRowCount === this.batch.totalRowCount) {
      this.batch.status = this.batch.failedCount === 0 ? 'completed' : 'completed_with_errors';
    } else {
      this.batch.status = 'processing';
    }
  }
}

describe('RosterImportService and RosterWorker', () => {
  const clock: Clock = { now: () => NOW };
  const identityProtector: IdentityProtector = {
    hashAdminLogin: (value) => `admin-${value}`,
    hashSessionToken: (value) => `session-${value}`,
    hashSourceAddress: (value) => `source-${value}`,
    hashStudentId: (value) => value.padEnd(64, '0'),
    toAdminSyntheticIdentity: (value) => `admin-${value}@admin.auth.invalid`,
    toSyntheticIdentity: (value) => `${value.padEnd(64, '0')}@auth.invalid`,
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('creates a one-row Batch with Entry Year derived inside Core', async () => {
    const repository = new MemoryRosterRepository();
    const service = new RosterImportService(repository, clock, identityProtector);

    const pending = await service.createStudent({
      actorAccountId: ADMIN_ACCOUNT_ID,
      firstNameTh: ' สมชาย ',
      lastNameTh: ' ใจดี ',
      studentId: '69000001',
    });

    expect(pending).toMatchObject({ entryYears: [2569], status: 'pending', totalRowCount: 1 });
    expect(repository.rows).toEqual([
      expect.objectContaining({
        entryYear: 2569,
        firstNameTh: 'สมชาย',
        lastNameTh: 'ใจดี',
        rowNumber: 2,
        studentIdPrefixHashes: [
          '6'.padEnd(64, '0'),
          '69'.padEnd(64, '0'),
          '690'.padEnd(64, '0'),
          '6900'.padEnd(64, '0'),
          '69000'.padEnd(64, '0'),
          '690000'.padEnd(64, '0'),
          '6900000'.padEnd(64, '0'),
        ],
      }),
    ]);
  });

  it('persists a valid Batch before bounded asynchronous provisioning completes it', async () => {
    const repository = new MemoryRosterRepository();
    const ensureIdentity = jest.fn().mockResolvedValue(undefined);
    const provider: StudentIdentityProvider = {
      ensureIdentity,
    };
    const service = new RosterImportService(repository, clock, identityProtector);
    const worker = new RosterWorker(repository, provider, clock, new ConfigService());
    const content = Buffer.from(
      'student_id,first_name_th,last_name_th\n66000001,สมชาย,ใจดี\n70000002,สมหญิง,มั่นคง',
      'utf8',
    );

    const pending = await service.createBatch({
      actorAccountId: ADMIN_ACCOUNT_ID,
      content,
    });
    expect(pending).toMatchObject({
      entryYears: [2566, 2570],
      status: 'pending',
      totalRowCount: 2,
    });

    await worker.processNextChunk();

    await expect(service.getBatch('batch-1')).resolves.toMatchObject({
      createdCount: 2,
      processedRowCount: 2,
      status: 'completed',
      unchangedCount: 0,
    });
    expect(ensureIdentity).toHaveBeenCalledTimes(2);
  });

  it('completes valid rows independently when another row is invalid', async () => {
    const repository = new MemoryRosterRepository();
    const ensureIdentity = jest.fn().mockResolvedValue(undefined);
    const provider: StudentIdentityProvider = { ensureIdentity };
    const service = new RosterImportService(repository, clock, identityProtector);
    const worker = new RosterWorker(repository, provider, clock, new ConfigService());

    const pending = await service.createBatch({
      actorAccountId: ADMIN_ACCOUNT_ID,
      content: Buffer.from(
        [
          'student_id,first_name_th,last_name_th',
          '69000001,สมชาย,ใจดี',
          'not-an-id,สมหญิง,มั่นคง',
          '70000001,สมปอง,กล้าหาญ',
        ].join('\n'),
        'utf8',
      ),
    });

    expect(pending).toMatchObject({ failedCount: 1, processedRowCount: 1, totalRowCount: 3 });
    await worker.processNextChunk();
    await expect(service.getBatch('batch-1')).resolves.toMatchObject({
      createdCount: 2,
      failedCount: 1,
      processedRowCount: 3,
      status: 'completed_with_errors',
    });
    expect(ensureIdentity).toHaveBeenCalledTimes(2);
  });

  it('reports an equivalent reimport as unchanged without creating Auth identities again', async () => {
    const repository = new MemoryRosterRepository();
    const studentIdHash = identityProtector.hashStudentId('69000001');
    repository.existing.set(studentIdHash, {
      firstNameTh: 'สมชาย',
      lastNameTh: 'ใจดี',
      personId: 'person-1',
    });
    const ensureIdentity = jest.fn().mockResolvedValue(undefined);
    const provider: StudentIdentityProvider = {
      ensureIdentity,
    };
    const service = new RosterImportService(repository, clock, identityProtector);
    const worker = new RosterWorker(repository, provider, clock, new ConfigService());

    await service.createBatch({
      actorAccountId: ADMIN_ACCOUNT_ID,
      content: Buffer.from('student_id,first_name_th,last_name_th\n69000001,สมชาย,ใจดี', 'utf8'),
    });
    await worker.processNextChunk();

    await expect(service.getBatch('batch-1')).resolves.toMatchObject({
      createdCount: 0,
      status: 'completed',
      unchangedCount: 1,
    });
    expect(ensureIdentity).not.toHaveBeenCalled();
    expect(repository.prefixHashes.get(studentIdHash)).toHaveLength(7);
  });

  it('creates a Roster Conflict without overwriting identity data or calling Auth', async () => {
    const repository = new MemoryRosterRepository();
    const studentIdHash = identityProtector.hashStudentId('69000001');
    repository.existing.set(studentIdHash, {
      firstNameTh: 'สมชาย',
      lastNameTh: 'ใจดี',
      personId: 'person-1',
    });
    const ensureIdentity = jest.fn().mockResolvedValue(undefined);
    const service = new RosterImportService(repository, clock, identityProtector);
    const worker = new RosterWorker(repository, { ensureIdentity }, clock, new ConfigService());

    await service.createBatch({
      actorAccountId: ADMIN_ACCOUNT_ID,
      content: Buffer.from('student_id,first_name_th,last_name_th\n69000001,สมหญิง,มั่นคง'),
    });
    await worker.processNextChunk();

    expect(repository.existing.get(studentIdHash)).toEqual({
      firstNameTh: 'สมชาย',
      lastNameTh: 'ใจดี',
      personId: 'person-1',
    });
    expect(repository.conflicts).toEqual([
      expect.objectContaining({
        existingFirstNameTh: 'สมชาย',
        incomingFirstNameTh: 'สมหญิง',
        status: 'pending',
      }),
    ]);
    expect(ensureIdentity).not.toHaveBeenCalled();
  });

  it('bounds provider retries and completes the Batch with errors after the third attempt', async () => {
    const repository = new MemoryRosterRepository();
    const ensureIdentity = jest.fn().mockRejectedValue(new Error('provider unavailable'));
    const provider: StudentIdentityProvider = {
      ensureIdentity,
    };
    const service = new RosterImportService(repository, clock, identityProtector);
    const worker = new RosterWorker(repository, provider, clock, new ConfigService());
    await service.createBatch({
      actorAccountId: ADMIN_ACCOUNT_ID,
      content: Buffer.from('student_id,first_name_th,last_name_th\n69000001,สมชาย,ใจดี', 'utf8'),
    });

    await worker.processNextChunk();
    await worker.processNextChunk();
    expect(reportOperationalError).not.toHaveBeenCalled();
    await worker.processNextChunk();

    await expect(service.getBatch('batch-1')).resolves.toMatchObject({
      failedCount: 1,
      processedRowCount: 1,
      status: 'completed_with_errors',
    });
    expect(ensureIdentity).toHaveBeenCalledTimes(3);
    expect(reportOperationalError).toHaveBeenCalledWith(expect.any(Error), {
      errorCode: 'ROSTER_AUTH_PROVIDER_UNAVAILABLE',
      operation: 'roster_row_provisioning_failed',
      runtime: 'roster-worker',
    });
    expect(repository.errors).toEqual([
      {
        errorCode: 'ROSTER_AUTH_PROVIDER_UNAVAILABLE',
        rowNumber: 2,
        studentId: '69000001',
      },
    ]);
  });

  it('builds the private error CSV from terminal row results only', async () => {
    const repository = new MemoryRosterRepository();
    const service = new RosterImportService(repository, clock, identityProtector);
    await service.createBatch({
      actorAccountId: ADMIN_ACCOUNT_ID,
      content: Buffer.from(
        'student_id,first_name_th,last_name_th\n=2+3,สมชาย,ใจดี\n69000001,สมหญิง,มั่นคง',
      ),
    });

    await expect(service.getErrorCsv('batch-1')).resolves.toContain(
      "2,'=2+3,INVALID_STUDENT_ID,รหัสนักศึกษาต้องเป็นตัวเลขอารบิก 8 หลัก",
    );
  });

  it('rejects accepting an incoming name without an audited reason', async () => {
    const service = new RosterImportService(new MemoryRosterRepository(), clock, identityProtector);

    await expect(
      service.resolveConflict({
        actorAccountId: ADMIN_ACCOUNT_ID,
        conflictId: '30000000-0000-4000-8000-000000000001',
        expectedVersion: 1,
        idempotencyKey: '40000000-0000-4000-8000-000000000001',
        reason: '   ',
        resolution: 'accept_incoming_name',
      }),
    ).rejects.toEqual(new RosterImportError('ROSTER_CONFLICT_REASON_REQUIRED', 422));
  });

  it('rejects an oversized file before persistence', async () => {
    const repository = new MemoryRosterRepository();
    const service = new RosterImportService(repository, clock, identityProtector);

    await expect(
      service.createBatch({
        actorAccountId: ADMIN_ACCOUNT_ID,
        content: new Uint8Array(5 * 1024 * 1024 + 1),
      }),
    ).rejects.toEqual(new RosterImportError('ROSTER_FILE_TOO_LARGE', 413));
    expect(repository.batch).toBeNull();
  });
});
