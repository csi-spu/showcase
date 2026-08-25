import { Inject, Injectable, Logger, OnApplicationShutdown, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Clock } from '../../auth/application/auth.ports';
import { AUTH_CLOCK } from '../../auth/application/auth.ports';
import {
  ROSTER_REPOSITORY,
  STUDENT_IDENTITY_PROVIDER,
  type ClaimedRosterRow,
  type RosterRepository,
  type StudentIdentityProvider,
} from './roster.ports';

const CHUNK_SIZE = 100;
const CLEANUP_CHUNK_SIZE = 1_000;
const CONCURRENCY = 10;
const LEASE_MILLISECONDS = 60_000;
const MAX_ATTEMPTS = 3;
const POLL_MILLISECONDS = 1_000;

@Injectable()
export class RosterWorker implements OnModuleInit, OnApplicationShutdown {
  private readonly logger = new Logger(RosterWorker.name);
  private isProcessing = false;
  private timer: ReturnType<typeof setInterval> | undefined;

  constructor(
    @Inject(ROSTER_REPOSITORY) private readonly repository: RosterRepository,
    @Inject(STUDENT_IDENTITY_PROVIDER) private readonly provider: StudentIdentityProvider,
    @Inject(AUTH_CLOCK) private readonly clock: Clock,
    private readonly config: ConfigService,
  ) {}

  onModuleInit(): void {
    if (this.config.get<string>('NODE_ENV') === 'test') return;
    this.timer = setInterval(() => void this.processNextChunkSafely(), POLL_MILLISECONDS);
    this.timer.unref();
    void this.processNextChunkSafely();
  }

  onApplicationShutdown(): void {
    if (this.timer !== undefined) {
      clearInterval(this.timer);
    }
  }

  async processNextChunk(): Promise<number> {
    const now = this.clock.now();
    await this.repository.deleteExpiredRowContent({ limit: CLEANUP_CHUNK_SIZE, now });
    const rows = await this.repository.claimRows({
      leaseUntil: new Date(now.getTime() + LEASE_MILLISECONDS),
      limit: CHUNK_SIZE,
      now,
    });
    for (let index = 0; index < rows.length; index += CONCURRENCY) {
      await Promise.all(rows.slice(index, index + CONCURRENCY).map((row) => this.processRow(row)));
    }
    return rows.length;
  }

  private async processNextChunkSafely(): Promise<void> {
    if (this.isProcessing) return;
    this.isProcessing = true;
    try {
      await this.processNextChunk();
    } catch {
      this.logger.error({ errorCode: 'ROSTER_WORKER_FAILED', operation: 'roster_processing' });
    } finally {
      this.isProcessing = false;
    }
  }

  private async processRow(row: ClaimedRosterRow): Promise<void> {
    const now = this.clock.now();
    const attemptCount = Math.min(row.attemptCount + 1, MAX_ATTEMPTS);
    const existingOutcome = await this.repository.settleExistingRow({
      batchId: row.batchId,
      now,
      rowId: row.rowId,
      studentIdHash: row.studentIdHash,
    });
    if (existingOutcome !== 'missing') return;

    try {
      await this.provider.ensureIdentity({
        password: row.studentId,
        providerUserId: row.providerUserId,
        syntheticIdentity: row.syntheticIdentity,
      });
    } catch {
      await this.recordRetryableFailure(row, attemptCount, 'ROSTER_AUTH_PROVIDER_UNAVAILABLE', now);
      return;
    }

    try {
      await this.repository.completeProvisioning({
        batchId: row.batchId,
        entryYear: row.entryYear,
        firstNameTh: row.firstNameTh,
        lastNameTh: row.lastNameTh,
        now,
        providerUserId: row.providerUserId,
        rowId: row.rowId,
        studentIdHash: row.studentIdHash,
        syntheticIdentity: row.syntheticIdentity,
      });
    } catch {
      await this.recordRetryableFailure(row, attemptCount, 'ROSTER_PROCESSING_FAILED', now);
    }
  }

  private async recordRetryableFailure(
    row: ClaimedRosterRow,
    attemptCount: number,
    errorCode: 'ROSTER_AUTH_PROVIDER_UNAVAILABLE' | 'ROSTER_PROCESSING_FAILED',
    now: Date,
  ): Promise<void> {
    await this.repository.recordFailure({
      attemptCount,
      batchId: row.batchId,
      errorCode,
      nextAttemptAt: new Date(now.getTime() + 2 ** (attemptCount - 1) * 1_000),
      now,
      rowId: row.rowId,
    });
  }
}
