import { Inject, Injectable, Logger, OnApplicationShutdown, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { reportOperationalError } from '../../../observability/sentry';
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
// Each in-flight row holds a connection from the pool shared with requests
// (Prisma defaults to 5 on production's 2 vCPUs); stay well below it.
const CONCURRENCY = 2;
const LEASE_MILLISECONDS = 60_000;
const MAX_ATTEMPTS = 3;
const POLL_MILLISECONDS = 1_000;

@Injectable()
export class RosterWorker implements OnModuleInit, OnApplicationShutdown {
  private readonly logger = new Logger(RosterWorker.name);
  private isProcessing = false;
  private hasReportedProcessingFailure = false;
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
      this.hasReportedProcessingFailure = false;
    } catch (error: unknown) {
      if (!this.hasReportedProcessingFailure) {
        reportOperationalError(error, {
          errorCode: 'ROSTER_WORKER_FAILED',
          operation: 'roster_processing',
          runtime: 'roster-worker',
        });
        this.hasReportedProcessingFailure = true;
      }
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
      studentIdPrefixHashes: row.studentIdPrefixHashes,
    });
    if (existingOutcome !== 'missing') return;

    try {
      await this.provider.ensureIdentity({
        password: row.studentId,
        providerUserId: row.providerUserId,
        syntheticIdentity: row.syntheticIdentity,
      });
    } catch (error: unknown) {
      await this.recordRetryableFailure(row, attemptCount, 'ROSTER_AUTH_PROVIDER_UNAVAILABLE', now);
      if (attemptCount >= MAX_ATTEMPTS) {
        reportOperationalError(error, {
          errorCode: 'ROSTER_AUTH_PROVIDER_UNAVAILABLE',
          operation: 'roster_row_provisioning_failed',
          runtime: 'roster-worker',
        });
      }
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
        studentIdPrefixHashes: row.studentIdPrefixHashes,
        syntheticIdentity: row.syntheticIdentity,
      });
    } catch (error: unknown) {
      await this.recordRetryableFailure(row, attemptCount, 'ROSTER_PROCESSING_FAILED', now);
      if (attemptCount >= MAX_ATTEMPTS) {
        reportOperationalError(error, {
          errorCode: 'ROSTER_PROCESSING_FAILED',
          operation: 'roster_row_persistence_failed',
          runtime: 'roster-worker',
        });
      }
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
