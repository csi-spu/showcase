import type { Clock, IdentityProtector } from '../../auth/application/auth.ports';
import { ConfigService } from '@nestjs/config';
import {
  type ClaimedRosterRow,
  type CreateRosterBatchInput,
  type ExistingRosterStudent,
  type RosterBatch,
  type RosterRepository,
  type StudentIdentityProvider,
} from './roster.ports';
import { RosterImportError, RosterImportService } from './roster-import.service';
import { RosterWorker } from './roster.worker';

const NOW = new Date('2026-08-25T06:00:00.000Z');
const ADMIN_ACCOUNT_ID = '10000000-0000-4000-8000-000000000001';

class MemoryRosterRepository implements RosterRepository {
  readonly existing = new Map<string, ExistingRosterStudent>();
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
    syntheticIdentity: string;
  }): Promise<'created' | 'unchanged'> {
    const outcome = this.existing.has(input.studentIdHash) ? 'unchanged' : 'created';
    this.existing.set(input.studentIdHash, {
      firstNameTh: input.firstNameTh,
      lastNameTh: input.lastNameTh,
    });
    this.finishRow(input.rowId, outcome);
    return Promise.resolve(outcome);
  }

  createBatch(input: CreateRosterBatchInput): Promise<RosterBatch> {
    this.rows.push(
      ...input.rows.map((row, index) => ({
        ...row,
        attemptCount: 0,
        batchId: 'batch-1',
        entryYear: input.entryYear,
        rowId: `row-${index + 1}`,
      })),
    );
    this.batch = {
      batchId: 'batch-1',
      createdCount: 0,
      entryYear: input.entryYear,
      failedCount: 0,
      processedRowCount: 0,
      status: 'pending',
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

  markUnchanged(input: { rowId: string }): Promise<void> {
    this.finishRow(input.rowId, 'unchanged');
    return Promise.resolve();
  }

  recordFailure(input: { attemptCount: number; rowId: string }): Promise<void> {
    const row = this.rows.find((candidate) => candidate.rowId === input.rowId);
    if (row !== undefined) {
      row.attemptCount = input.attemptCount;
      if (input.attemptCount >= 3) {
        this.finishRow(input.rowId, 'failed');
      }
    }
    return Promise.resolve();
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

  it('persists a valid Batch before bounded asynchronous provisioning completes it', async () => {
    const repository = new MemoryRosterRepository();
    const ensureIdentity = jest.fn().mockResolvedValue(undefined);
    const provider: StudentIdentityProvider = {
      ensureIdentity,
    };
    const service = new RosterImportService(repository, clock, identityProtector);
    const worker = new RosterWorker(repository, provider, clock, new ConfigService());
    const content = Buffer.from(
      'student_id,first_name_th,last_name_th\n69000001,สมชาย,ใจดี\n69000002,สมหญิง,มั่นคง',
      'utf8',
    );

    const pending = await service.createBatch({
      actorAccountId: ADMIN_ACCOUNT_ID,
      content,
      entryYear: 2569,
    });
    expect(pending).toMatchObject({ status: 'pending', totalRowCount: 2 });

    await worker.processNextChunk();

    await expect(service.getBatch('batch-1')).resolves.toMatchObject({
      createdCount: 2,
      processedRowCount: 2,
      status: 'completed',
      unchangedCount: 0,
    });
    expect(ensureIdentity).toHaveBeenCalledTimes(2);
  });

  it('reports an equivalent reimport as unchanged without creating Auth identities again', async () => {
    const repository = new MemoryRosterRepository();
    const studentIdHash = identityProtector.hashStudentId('69000001');
    repository.existing.set(studentIdHash, { firstNameTh: 'สมชาย', lastNameTh: 'ใจดี' });
    const ensureIdentity = jest.fn().mockResolvedValue(undefined);
    const provider: StudentIdentityProvider = {
      ensureIdentity,
    };
    const service = new RosterImportService(repository, clock, identityProtector);
    const worker = new RosterWorker(repository, provider, clock, new ConfigService());

    await service.createBatch({
      actorAccountId: ADMIN_ACCOUNT_ID,
      content: Buffer.from('student_id,first_name_th,last_name_th\n69000001,สมชาย,ใจดี', 'utf8'),
      entryYear: 2569,
    });
    await worker.processNextChunk();

    await expect(service.getBatch('batch-1')).resolves.toMatchObject({
      createdCount: 0,
      status: 'completed',
      unchangedCount: 1,
    });
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
      entryYear: 2569,
    });

    await worker.processNextChunk();
    await worker.processNextChunk();
    await worker.processNextChunk();

    await expect(service.getBatch('batch-1')).resolves.toMatchObject({
      failedCount: 1,
      processedRowCount: 1,
      status: 'completed_with_errors',
    });
    expect(ensureIdentity).toHaveBeenCalledTimes(3);
  });

  it('rejects an oversized file before persistence', async () => {
    const repository = new MemoryRosterRepository();
    const service = new RosterImportService(repository, clock, identityProtector);

    await expect(
      service.createBatch({
        actorAccountId: ADMIN_ACCOUNT_ID,
        content: new Uint8Array(5 * 1024 * 1024 + 1),
        entryYear: 2569,
      }),
    ).rejects.toEqual(new RosterImportError('ROSTER_FILE_TOO_LARGE', 413));
    expect(repository.batch).toBeNull();
  });
});
